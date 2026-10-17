export type Region = "id" | "my" | "intl";
export type PlanKey = "weekly" | "monthly" | "permanent";

export interface Plan {
  id: string;
  region: Region;
  key: PlanKey;
  price: string;
  durationDays: number | null;
}

export const PLANS: Record<Region, Record<PlanKey, Plan>> = {
  id: {
    weekly: { id: "id_weekly", region: "id", key: "weekly", price: "Rp 35.000", durationDays: 7 },
    monthly: { id: "id_monthly", region: "id", key: "monthly", price: "Rp 80.000", durationDays: 30 },
    permanent: { id: "id_permanent", region: "id", key: "permanent", price: "Rp 150.000", durationDays: null },
  },
  my: {
    weekly: { id: "my_weekly", region: "my", key: "weekly", price: "RM 11", durationDays: 7 },
    monthly: { id: "my_monthly", region: "my", key: "monthly", price: "RM 35", durationDays: 30 },
    permanent: { id: "my_permanent", region: "my", key: "permanent", price: "RM 80", durationDays: null },
  },
  intl: {
    weekly: { id: "intl_weekly", region: "intl", key: "weekly", price: "$10", durationDays: 7 },
    monthly: { id: "intl_monthly", region: "intl", key: "monthly", price: "$20", durationDays: 30 },
    permanent: { id: "intl_permanent", region: "intl", key: "permanent", price: "$50", durationDays: null },
  },
};

export function getPlan(region: Region, key: PlanKey): Plan {
  return PLANS[region][key];
}

export function findPlanById(planId: string): Plan | null {
  for (const region of Object.values(PLANS)) {
    for (const plan of Object.values(region)) {
      if (plan.id === planId) return plan;
    }
  }
  return null;
}

/**
 * Fills the `{amount}` placeholder in a payment method's details with the
 * plan's numeric price (e.g. "$20" -> "20"), so a link can carry the exact
 * amount for the plan the buyer picked. Only the PayPal link uses it, and
 * only the international region (USD prices); methods without the
 * placeholder come back unchanged.
 */
export function fillPlanDetails(details: string, plan: Plan): string {
  const amount = plan.price.replace(/[^0-9.]/g, "");
  return details.replace(/\{amount\}/g, amount);
}

export const PAYMENT_METHODS: Record<Region, { id: string; label: string; details: string }[]> = {
  id: [
    {
      id: "qris",
      label: "QRIS (All e-wallet & bank)",
      details:
        "Scan QRIS code yang dikirim di bawah pakai e-wallet apapun (GoPay / OVO / DANA / ShopeePay / LinkAja / m-banking).\n\n📌 Atas nama: <b>INNOMINATA, DIGITAL & KREATIF</b>",
    },
  ],
  my: [
    {
      id: "qris",
      label: "QRIS (Scan with any e-wallet)",
      details:
        "Scan the QRIS code below using any e-wallet that supports cross-border QRIS (TNG eWallet, Boost, MAE, dll).\n\n📌 Merchant: <b>INNOMINATA, DIGITAL & KREATIF</b>",
    },
  ],
  intl: [
    {
      id: "paddle",
      label: "💳 Card / Apple Pay / Google Pay",
      details: "",
    },
    {
      // Manual, like Wise: the buyer pays via paypal.me, sends a screenshot,
      // and the admin verifies and approves it.
      id: "paypal",
      label: "PayPal",
      // {amount} is replaced per plan (see fillPlanDetails), so the link opens
      // with the right amount already filled in.
      details:
        "Send via PayPal:\n🔗 https://paypal.me/prtm31/{amount}USD\n\n💰 Amount: <b>{amount} USD</b> (already filled in the link, please don't change it)",
    },
    {
      id: "wise",
      label: "Wise",
      details:
        "Send via Wise:\n📌 Wise email: <b>prtm31@gmail.com</b>",
    },
    {
      id: "crypto_trc20",
      label: "Crypto (USDT TRC-20)",
      details:
        "Send USDT via TRC-20 network to:\n\n📌 <code>TRppnV9Ur1Jt4zgQmDkyEsLuNUmaxoZrA9</code>\n\nOr scan the QR code below. Make sure to use the <b>TRC-20</b> network.",
    },
  ],
};
