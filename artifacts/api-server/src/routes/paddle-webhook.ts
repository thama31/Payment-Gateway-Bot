import { Router, type IRouter, type Request } from "express";
import { db, paymentProofsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { verifyPaddleWebhookSignature, planKeyFromPriceId, fetchPaddleCustomer } from "../bot/paddle";
import { grantSubscriptionAccess, bot, ADMIN_ID } from "../bot/index";
import { findPlanById } from "../bot/plans";

const router: IRouter = Router();

interface PaddleTransactionEvent {
  event_id: string;
  event_type: string;
  data: {
    id: string;
    status: string;
    customer_id?: string | null;
    currency_code?: string;
    origin?: string;
    custom_data?: {
      telegramId?: string;
      planId?: string;
      region?: string;
    } | null;
    items?: { price?: { id?: string } }[];
    details?: { totals?: { grand_total?: string; currency_code?: string } };
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Paddle amounts are strings in the currency's smallest unit ("5000" = 50.00 USD).
function formatMinorAmount(minor: string | undefined, currency: string | undefined): string | null {
  if (!minor || !currency) return null;
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return `${(Number(minor) / Math.pow(10, digits)).toFixed(digits)} ${currency}`;
  } catch {
    return `${minor} ${currency}`;
  }
}

// A payment arrived with no Telegram ID attached (e.g. bought through the
// website's Vault buttons instead of the bot). We can't grant access
// automatically, so tell the admin who paid and for what.
async function notifyAdminOfUnlinkedPayment(event: PaddleTransactionEvent): Promise<void> {
  const d = event.data;
  const priceId = d.items?.[0]?.price?.id;
  const planKey = priceId ? planKeyFromPriceId(priceId) : null;
  const planLine = planKey
    ? `<b>${planKey}</b>`
    : `unknown (<code>${escapeHtml(priceId ?? "n/a")}</code>)`;
  const amount = formatMinorAmount(d.details?.totals?.grand_total, d.details?.totals?.currency_code ?? d.currency_code);
  const customer = d.customer_id ? await fetchPaddleCustomer(d.customer_id) : null;
  const isRenewal = d.origin === "subscription_recurring";

  const lines = [
    isRenewal ? "🔁 <b>Paddle renewal (no Telegram link)</b>" : "💰 <b>New Paddle payment — not from the bot</b>",
    "",
    `📦 Plan: ${planLine}`,
  ];
  if (amount) lines.push(`💵 Paid: ${escapeHtml(amount)}`);
  if (customer?.email) {
    lines.push(`✉️ ${escapeHtml(customer.name ? `${customer.name} · ${customer.email}` : customer.email)}`);
  }
  lines.push(`🧾 Txn: <code>${escapeHtml(d.id)}</code>`);
  if (!isRenewal) {
    lines.push(
      "",
      "No Telegram ID came with this payment, so access wasn't granted automatically. Once the buyer messages you, add them with:",
      `<code>/adduser &lt;telegram_id&gt; intl ${planKey ?? "plan"}</code>`
    );
  }
  await bot.api.sendMessage(ADMIN_ID, lines.join("\n"), { parse_mode: "HTML" });
}

router.post("/webhooks/paddle", async (req, res) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.header("Paddle-Signature");

  if (!rawBody || !verifyPaddleWebhookSignature(rawBody, signature)) {
    logger.warn("Rejected Paddle webhook: invalid signature");
    res.status(401).json({ error: "invalid signature" });
    return;
  }

  const event = req.body as PaddleTransactionEvent;

  // Always ack quickly so Paddle doesn't retry; log and bail for anything
  // we don't need to act on.
  if (event.event_type !== "transaction.completed") {
    res.status(200).json({ received: true });
    return;
  }

  const txnId = event.data.id;
  const telegramIdStr = event.data.custom_data?.telegramId;
  const planId = event.data.custom_data?.planId;

  if (!telegramIdStr || !planId) {
    // Not from the bot. Ack immediately (Paddle expects a fast 2xx), then
    // tell the admin in the background.
    logger.info({ txnId }, "Paddle payment without Telegram custom_data (website purchase?), notifying admin");
    res.status(200).json({ received: true });
    void notifyAdminOfUnlinkedPayment(event).catch((err) =>
      logger.error({ err, txnId }, "Failed to notify admin about unlinked Paddle payment")
    );
    return;
  }

  const telegramId = Number(telegramIdStr);
  const plan = findPlanById(planId);
  if (!plan) {
    logger.error({ txnId, planId }, "Paddle webhook: unknown planId");
    res.status(200).json({ received: true });
    return;
  }

  try {
    // Idempotency: Paddle may deliver the same webhook more than once.
    // We reuse payment_proofs as a lightweight ledger, keyed by txn id in `caption`.
    const existing = await db
      .select()
      .from(paymentProofsTable)
      .where(and(eq(paymentProofsTable.method, "paddle"), eq(paymentProofsTable.caption, txnId)))
      .limit(1);

    if (existing.length > 0) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    await db.insert(paymentProofsTable).values({
      telegramId,
      username: null,
      planId: plan.id,
      region: plan.region,
      method: "paddle",
      fileId: null,
      caption: txnId,
      status: "approved",
      reviewedAt: new Date(),
    });

    await grantSubscriptionAccess(telegramId, plan, txnId);

    try {
      const userRow = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
      const u = userRow[0];
      const who = u?.username ? `@${u.username}` : u?.firstName ? u.firstName : `ID ${telegramId}`;
      await bot.api.sendMessage(
        ADMIN_ID,
        `💰 <b>New Paddle payment</b>\n\n👤 ${who} (<code>${telegramId}</code>)\n📦 Plan: <b>${plan.key}</b> — ${plan.price}\n🧾 Txn: <code>${txnId}</code>`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      logger.error({ err }, "Failed to notify admin about Paddle payment");
    }

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err, txnId }, "Failed to process Paddle webhook");
    // Still 200 — we don't want Paddle hammering retries for a bug on our
    // side once we've logged it; investigate via logs instead.
    res.status(200).json({ received: true, error: true });
  }
});

export default router;
