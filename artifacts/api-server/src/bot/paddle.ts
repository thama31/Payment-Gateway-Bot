import crypto from "node:crypto";
import { logger } from "../lib/logger";
import type { Plan, PlanKey } from "./plans";

const PADDLE_WEBHOOK_SECRET = process.env["PADDLE_WEBHOOK_SECRET"];

// Hosted checkout page on an already Paddle-approved domain (the innominata
// ebook site's own /pay.html). Checkout opens client-side via Paddle.js —
// no server-side transaction creation needed, which also sidesteps the
// per-domain checkout approval issue entirely (the bot's own fly.dev domain
// was rejected by Paddle's review; this domain is already approved and
// already runs a working Paddle checkout for the Vault product).
const CHECKOUT_PAGE_URL = process.env["PADDLE_CHECKOUT_PAGE_URL"] ?? "https://innominata.netlify.app/pay.html";

// Map each plan key to its Paddle Price ID (set these in your Paddle dashboard
// under Catalog > Products, then paste the Price IDs into env vars).
const PADDLE_PRICE_IDS: Record<PlanKey, string | undefined> = {
  weekly: process.env["PADDLE_PRICE_ID_WEEKLY"],
  monthly: process.env["PADDLE_PRICE_ID_MONTHLY"],
  permanent: process.env["PADDLE_PRICE_ID_PERMANENT"],
};

export function isPaddleConfigured(): boolean {
  return Boolean(PADDLE_WEBHOOK_SECRET);
}

/** Reverse lookup: which of our plans does this Paddle price ID belong to? */
export function planKeyFromPriceId(priceId: string): PlanKey | null {
  for (const [key, id] of Object.entries(PADDLE_PRICE_IDS)) {
    if (id && id === priceId) return key as PlanKey;
  }
  return null;
}

const PADDLE_API_BASE =
  process.env["PADDLE_ENV"] === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

/**
 * Best-effort lookup of a customer's name/email (the transaction webhook only
 * carries the customer ID). Needs PADDLE_API_KEY with customer read access.
 * Returns null on any failure — callers must treat this as optional info.
 */
export async function fetchPaddleCustomer(
  customerId: string
): Promise<{ email: string | null; name: string | null } | null> {
  const apiKey = process.env["PADDLE_API_KEY"];
  if (!apiKey) return null;
  try {
    const res = await fetch(`${PADDLE_API_BASE}/customers/${encodeURIComponent(customerId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Paddle customer lookup failed");
      return null;
    }
    const json = (await res.json()) as { data?: { email?: string | null; name?: string | null } };
    return { email: json.data?.email ?? null, name: json.data?.name ?? null };
  } catch (err) {
    logger.warn({ err }, "Paddle customer lookup errored");
    return null;
  }
}

/**
 * Builds a link to our hosted checkout page, which opens Paddle's
 * client-side Checkout overlay for the given plan (card, PayPal, etc. —
 * whatever payment methods are enabled on the Paddle account).
 *
 * telegramId/planId/region are passed as query params and attached as
 * Paddle custom_data by pay.html, so the webhook handler can identify who
 * paid for what once payment completes.
 */
export function createPaddleCheckoutUrl(plan: Plan, telegramId: number): string | null {
  const priceId = PADDLE_PRICE_IDS[plan.key];
  if (!priceId) {
    logger.error({ planKey: plan.key }, "No Paddle price id configured for this plan");
    return null;
  }
  const url = new URL(CHECKOUT_PAGE_URL);
  url.searchParams.set("price", priceId);
  url.searchParams.set("tid", String(telegramId));
  url.searchParams.set("plan", plan.id);
  url.searchParams.set("region", plan.region);
  return url.toString();
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
