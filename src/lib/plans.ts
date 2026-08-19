/**
 * Plans, prices and what each one unlocks.
 *
 * One definition, read by the pricing section, the upgrade page, the credit
 * meter and the feature gates. Two lists that describe the same plan will
 * disagree eventually, and the version a customer reads before paying is the
 * one that has to be true.
 *
 * Pure and dependency-free so the gating rules can be tested directly.
 */

export const PLAN_IDS = ["free", "monthly", "half_yearly", "yearly"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * Features a plan can unlock.
 *
 * Named after what the customer gets, not after the page that implements it,
 * so moving a feature between pages does not invalidate a paid entitlement.
 */
export const FEATURES = [
  "analysis",        // run an AI analysis at all
  "explore",         // group and summarise a file
  "export_pdf",
  "export_excel",
  "branding",        // own logo and signature on documents
  "saved_views",     // pin charts onto one screen
  "customer_groups",
  "saved_formulas",
  "saved_numbers",
  "alerts",
  "share_links",
  "priority_support",
] as const;

export type Feature = (typeof FEATURES)[number];

/** Credits granted per period. `null` means unmetered. */
export type Plan = {
  id: PlanId;
  name: string;
  /** Price in paise, so no float ever touches money. */
  priceMinor: number;
  currency: "INR";
  period: string;
  /** Null = unlimited. */
  credits: number | null;
  tagline: string;
  features: readonly Feature[];
  /** Shown as ticks on the pricing card. */
  highlights: readonly string[];
  popular?: boolean;
};

const PAID_CORE: readonly Feature[] = [
  "analysis",
  "explore",
  "export_pdf",
  "export_excel",
  "branding",
  "share_links",
  "saved_views",
  "customer_groups",
];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMinor: 0,
    currency: "INR",
    period: "forever",
    credits: 10,
    tagline: "Enough to see whether Nexus reads your data properly.",
    /*
     * Free deliberately includes the whole core loop — upload, analyse,
     * export. A trial that cannot produce the thing you are buying tells the
     * customer nothing. What it does not include is the work that only pays
     * off when you come back: saving, comparing and being told about changes.
     */
    features: [
      "analysis",
      "explore",
      "export_pdf",
      "export_excel",
      // Opened up on request: these were locked, and a padlock on a screen a
      // free account can reach teaches people to ignore padlocks. Saved
      // formulas and customer groups stay paid — they are the two the product
      // sells on.
      "saved_views",
      "saved_numbers",
      "alerts",
      "share_links",
    ],
    highlights: [
      "10 AI analysis credits",
      "Unlimited file uploads",
      "PDF and Excel export",
      "Charts, anomalies and forecasts",
    ],
  },

  monthly: {
    id: "monthly",
    name: "1 Month",
    priceMinor: 29_900,
    currency: "INR",
    period: "per month",
    credits: 30,
    tagline: "For a regular monthly reporting cycle.",
    features: [...PAID_CORE, "saved_formulas", "saved_numbers"],
    highlights: [
      "30 AI analysis credits a month",
      "Your logo and signature on every document",
      "Saved Views and Customer Groups",
      "Saved Formulas and Saved Numbers",
      "Shareable report links",
    ],
  },

  half_yearly: {
    id: "half_yearly",
    name: "6 Months",
    priceMinor: 179_900,
    currency: "INR",
    period: "every 6 months",
    credits: 200,
    tagline: "The usual choice for a working finance team.",
    popular: true,
    features: [...PAID_CORE, "saved_formulas", "saved_numbers", "alerts"],
    highlights: [
      "200 AI analysis credits",
      "Everything in the monthly plan",
      "Alerts when a number crosses your line",
      "Priority on new features",
    ],
  },

  yearly: {
    id: "yearly",
    name: "1 Year",
    priceMinor: 299_900,
    currency: "INR",
    period: "per year",
    credits: null,
    tagline: "Unlimited analysis, for teams that live in their numbers.",
    features: [
      ...PAID_CORE,
      "saved_formulas",
      "saved_numbers",
      "alerts",
      "priority_support",
    ],
    highlights: [
      "Unlimited AI analysis credits",
      "Everything in the 6-month plan",
      "Priority support",
      "Cheaper than 6 months twice over",
    ],
  },
};

export const PLAN_LIST: readonly Plan[] = PLAN_IDS.map((id) => PLANS[id]);

/** Formats paise as rupees, without a trailing ".00" on whole amounts. */
export function formatPrice(plan: Plan): string {
  if (plan.priceMinor === 0) return "Free";
  const rupees = plan.priceMinor / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Whether a plan includes a feature at all.
 *
 * Entitlement only. Whether the customer has credits left to *use* it is a
 * separate question — see canUseFeature().
 */
export function planIncludes(planId: PlanId, feature: Feature): boolean {
  return PLANS[planId].features.includes(feature);
}

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "not_in_plan" | "no_credits"; message: string };

/**
 * The single gate every feature asks.
 *
 * Two different refusals, kept apart on purpose, because the fix is different
 * and telling someone the wrong one wastes their time:
 *
 *   - "not_in_plan" — upgrading is the answer.
 *   - "no_credits"  — the plan is right, the allowance is spent. Waiting for
 *                     the next period, or moving up, are both valid.
 *
 * Features that cost no compute stay usable at zero credits. Reading a report
 * you already paid to produce, or exporting it again, must not stop working
 * because the meter hit zero — that would be taking back something already
 * bought.
 */
const METERED: readonly Feature[] = ["analysis", "explore"];

export function canUseFeature(
  planId: PlanId,
  feature: Feature,
  creditsRemaining: number,
): AccessDecision {
  const plan = PLANS[planId];

  if (!plan.features.includes(feature)) {
    return {
      allowed: false,
      reason: "not_in_plan",
      message: `This is part of the paid plans. You are on ${plan.name}.`,
    };
  }

  // Unlimited plans never run out.
  if (plan.credits === null) return { allowed: true };

  if (METERED.includes(feature) && creditsRemaining <= 0) {
    return {
      allowed: false,
      reason: "no_credits",
      message:
        plan.id === "free"
          ? "You have used all 10 free credits. Choose a plan to keep analysing."
          : `You have used every credit on the ${plan.name} plan.`,
    };
  }

  return { allowed: true };
}

/**
 * Maps the plan tier stored on an organization to a plan here.
 *
 * The database column predates these plans and carries the older tier names.
 * Anything unrecognised resolves to free, so a bad value withholds features
 * rather than granting them.
 */
export function planForTier(tier: string | null | undefined): PlanId {
  switch (tier) {
    case "monthly":
      return "monthly";
    case "half_yearly":
    case "business":
      return "half_yearly";
    case "yearly":
    case "enterprise":
      return "yearly";
    case "pro":
      return "monthly";
    default:
      return "free";
  }
}
