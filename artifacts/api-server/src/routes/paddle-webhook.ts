import { Router, type IRouter, type Request } from "express";
import { db, paymentProofsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { verifyPaddleWebhookSignature } from "../bot/paddle";
import { grantSubscriptionAccess } from "../bot/index";
import { findPlanById } from "../bot/plans";

const router: IRouter = Router();

interface PaddleTransactionEvent {
  event_id: string;
  event_type: string;
  data: {
    id: string;
    status: string;
    custom_data?: {
      telegramId?: string;
      planId?: string;
      region?: string;
    } | null;
  };
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
    logger.error({ txnId }, "Paddle transaction.completed missing custom_data");
    res.status(200).json({ received: true });
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

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err, txnId }, "Failed to process Paddle webhook");
    // Still 200 — we don't want Paddle hammering retries for a bug on our
    // side once we've logged it; investigate via logs instead.
    res.status(200).json({ received: true, error: true });
  }
});

export default router;
