import { findPlanById, type Plan, type PlanKey } from "./plans";

/**
 * Price of each plan in Telegram Stars (currency "XTR").
 *
 * Chosen so the owner nets roughly the USD price of the plan: a Star pays the
 * developer about $0.013, so $10 / $20 / $50 -> 770 / 1,540 / 3,850 Stars.
 * Buyers who buy Stars inside the app pay more per Star (store fees), so the
 * price they see in dollars is higher than the plan's USD price.
 */
export const STARS_PRICES: Record<PlanKey, number> = {
  weekly: 770,
  monthly: 1540,
  permanent: 3850,
};

/** What the admin is charged while testing (see starsPriceFor). */
export const ADMIN_TEST_STARS = 1;

/**
 * Stars to charge `fromId` for `planKey`. Everyone pays STARS_PRICES, except
 * the admin when STARS_ADMIN_TEST=1 is set: then the admin's OWN invoices cost
 * 1 Star, so the whole flow can be tested for almost nothing. No other buyer
 * is ever affected, and the check below uses the same function, so a buyer
 * cannot pay the test price.
 */
export function starsPriceFor(
  planKey: PlanKey,
  fromId: number,
  opts?: { adminId?: number; adminTest?: boolean }
): number {
  if (opts?.adminTest && opts.adminId !== undefined && fromId === opts.adminId) return ADMIN_TEST_STARS;
  return STARS_PRICES[planKey];
}

/** id of the "Telegram Stars" entry in PAYMENT_METHODS. */
export const STARS_METHOD_ID = "stars";

/**
 * Stars are only offered in the international menu: those plans are priced in
 * USD, which the Star amounts above are based on. The id / my plans are priced
 * in IDR / MYR and would need their own Star amounts.
 */
export function starsPlan(planId: string): Plan | null {
  const plan = findPlanById(planId);
  return plan && plan.region === "intl" ? plan : null;
}

export function buildStarsPayload(planId: string, telegramId: number): string {
  return `stars:${planId}:${telegramId}`;
}

export function parseStarsPayload(payload: string): { plan: Plan; telegramId: number } | null {
  const m = /^stars:([a-z_]+):(\d+)$/.exec(payload);
  if (!m) return null;
  const plan = starsPlan(m[1]!);
  if (!plan) return null;
  return { plan, telegramId: Number(m[2]) };
}

// Both members carry both fields (the unused one is `undefined`), so reading
// `check.reason` / `check.plan` compiles with or without strict mode, and
// narrowing on `ok` still works under strict mode.
export type StarsCheck =
  | { ok: true; plan: Plan; reason?: undefined }
  | { ok: false; plan?: undefined; reason: "currency" | "payload" | "payer" | "amount" };

/** Is this checkout / payment one the bot itself invoiced, for the right plan, amount and payer? */
export function isValidStarsCheckout(input: {
  currency: string;
  totalAmount: number;
  payload: string;
  fromId: number;
  adminId?: number;
  adminTest?: boolean;
}): StarsCheck {
  if (input.currency !== "XTR") return { ok: false, reason: "currency" };
  const parsed = parseStarsPayload(input.payload);
  if (!parsed) return { ok: false, reason: "payload" };
  if (parsed.telegramId !== input.fromId) return { ok: false, reason: "payer" };
  const expected = starsPriceFor(parsed.plan.key, input.fromId, { adminId: input.adminId, adminTest: input.adminTest });
  if (input.totalAmount !== expected) return { ok: false, reason: "amount" };
  return { ok: true, plan: parsed.plan };
}
