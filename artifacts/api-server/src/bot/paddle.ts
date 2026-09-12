import crypto from "node:crypto";
import { logger } from "../lib/logger";
import type { Plan, PlanKey } from "./plans";

const PADDLE_API_KEY = process.env["PADDLE_API_KEY"];
const PADDLE_WEBHOOK_SECRET = process.env["PADDLE_WEBHOOK_SECRET"];
const PADDLE_ENV = process.env["PADDLE_ENV"] === "sandbox" ? "sandbox" : "production";
const PADDLE_API_BASE =
  PADDLE_ENV === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

// Map each plan key to its Paddle Price ID (set these in your Paddle dashboard
// under Catalog > Products, then paste the Price IDs into env vars).
const PADDLE_PRICE_IDS: Record<PlanKey, string | undefined> = {
  weekly: process.env["PADDLE_PRICE_ID_WEEKLY"],
  monthly: process.env["PADDLE_PRICE_ID_MONTHLY"],
  permanent: process.env["PADDLE_PRICE_ID_PERMANENT"],
};

export function isPaddleConfigured(): boolean {
  return Boolean(PADDLE_API_KEY && PADDLE_WEBHOOK_SECRET);
}

/**
 * Creates a Paddle transaction for the given plan and returns a hosted
 * checkout URL the user can open to pay (card, PayPal, etc. — whatever
 * payment methods are enabled on your Paddle account).
 *
 * telegramId/planId/region are attached as custom_data so the webhook
 * handler can identify who paid for what once payment completes.
 */
export async function createPaddleCheckout(plan: Plan, telegramId: number): Promise<string | null> {
  if (!PADDLE_API_KEY) {
    logger.error("PADDLE_API_KEY is not set");
    return null;
  }
  const priceId = PADDLE_PRICE_IDS[plan.key];
  if (!priceId) {
    logger.error({ planKey: plan.key }, "No Paddle price id configured for this plan");
    return null;
  }

  try {
    const res = await fetch(`${PADDLE_API_BASE}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: {
          telegramId: String(telegramId),
          planId: plan.id,
          region: plan.region,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error({ status: res.status, errText }, "Paddle create-transaction request failed");
      return null;
    }

    const json = (await res.json()) as { data?: { checkout?: { url?: string } } };
    return json.data?.checkout?.url ?? null;
  } catch (err) {
    logger.error({ err }, "Failed to call Paddle API");
    return null;
  }
}

/**
 * Verifies the `Paddle-Signature` header against the raw request body.
 * Header format: "ts=<unix_timestamp>;h1=<hex hmac-sha256>"
 * MUST be called with the untouched raw body bytes — any re-serialization
 * (e.g. JSON.stringify(req.body)) will produce a different signature.
 */
export function verifyPaddleWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!PADDLE_WEBHOOK_SECRET) {
    logger.error("PADDLE_WEBHOOK_SECRET is not set");
    return false;
  }
  if (!signatureHeader) return false;

  const match = /^ts=(\d+);h1=([0-9a-f]+)$/i.exec(signatureHeader.trim());
  if (!match) return false;
  const [, ts, h1] = match as unknown as [string, string, string];

  // Reject stale webhooks (replay-attack protection). Paddle's own SDKs
  // default to 5 seconds; we allow a bit more slack for clock drift.
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Number(ts)) > 300) {
    logger.warn({ ts }, "Paddle webhook timestamp outside tolerance, rejecting");
    return false;
  }

  const signedPayload = `${ts}:${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", PADDLE_WEBHOOK_SECRET).update(signedPayload).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(h1, "hex"));
  } catch {
    return false;
  }
}
