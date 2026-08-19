import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseFeature,
  FEATURES,
  formatPrice,
  PLAN_IDS,
  PLANS,
  planIncludes,
} from "../src/lib/plans.ts";

/**
 * Plans and the gate in front of every feature.
 *
 * These pin down what a customer is actually buying — the version they read
 * before paying has to be the version the code enforces.
 */

test("the advertised prices and credits are what the code holds", () => {
  assert.equal(PLANS.free.credits, 10);
  assert.equal(PLANS.free.priceMinor, 0);

  assert.equal(PLANS.monthly.credits, 30);
  assert.equal(PLANS.monthly.priceMinor, 29_900); // ₹299

  assert.equal(PLANS.half_yearly.credits, 200);
  assert.equal(PLANS.half_yearly.priceMinor, 179_900); // ₹1,799

  assert.equal(PLANS.yearly.credits, null); // unlimited
  assert.equal(PLANS.yearly.priceMinor, 299_900); // ₹2,999
});

test("prices render in rupees with Indian grouping", () => {
  assert.equal(formatPrice(PLANS.free), "Free");
  assert.equal(formatPrice(PLANS.monthly), "₹299");
  assert.equal(formatPrice(PLANS.half_yearly), "₹1,799");
  assert.equal(formatPrice(PLANS.yearly), "₹2,999");
});

test("free includes the whole core loop, so the trial proves something", () => {
  // A trial that cannot produce the deliverable tells the customer nothing.
  for (const feature of ["analysis", "explore", "export_pdf", "export_excel"] as const) {
    assert.equal(planIncludes("free", feature), true, feature);
  }
});

test("free withholds nothing — the allowance is the only limit", () => {
  /*
   * The line moved again, deliberately and on request: no feature is held
   * back by plan any more. What separates the plans is how many credits they
   * carry, so this asserts the absence of a feature gate rather than where it
   * sits — if a padlock is ever reintroduced, this fails and says so.
   */
  for (const feature of FEATURES) {
    assert.equal(planIncludes("free", feature), true, feature);
  }
});

test("free carries the features that were opened up", () => {
  for (const feature of ["saved_views", "saved_numbers", "alerts", "share_links"] as const) {
    assert.equal(planIncludes("free", feature), true, feature);
  }
});

test("each paid tier is a superset of the one below it", () => {
  // Paying more must never take something away.
  const order = ["monthly", "half_yearly", "yearly"] as const;
  for (let i = 1; i < order.length; i++) {
    for (const feature of PLANS[order[i - 1]].features) {
      assert.ok(
        planIncludes(order[i], feature),
        `${order[i]} is missing ${feature}, which ${order[i - 1]} includes`,
      );
    }
  }
});

test("a free user with credits can analyse", () => {
  assert.deepEqual(canUseFeature("free", "analysis", 10), { allowed: true });
  assert.deepEqual(canUseFeature("free", "explore", 1), { allowed: true });
});

test("running out of credits stops the metered work", () => {
  const decision = canUseFeature("free", "analysis", 0);
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "no_credits");
  assert.match(
    decision.allowed === false ? decision.message : "",
    /used all 10 free credits/,
  );
});

test("running out of credits does not take back what was already produced", () => {
  // Re-downloading a report you already paid to generate must keep working;
  // otherwise hitting zero retroactively removes something bought earlier.
  assert.deepEqual(canUseFeature("free", "export_pdf", 0), { allowed: true });
  assert.deepEqual(canUseFeature("free", "export_excel", 0), { allowed: true });
  assert.deepEqual(canUseFeature("monthly", "export_pdf", 0), { allowed: true });
});

test("with every feature included, a refusal can only ever be about credits", () => {
  // The "not_in_plan" branch still exists for a future plan that withholds
  // something; today nothing reaches it, and a refusal that blamed the plan
  // would be telling the user to buy something they already have.
  assert.deepEqual(canUseFeature("free", "saved_formulas", 10), { allowed: true });

  const spent = canUseFeature("free", "analysis", 0);
  assert.equal(spent.allowed, false);
  assert.equal(spent.allowed === false && spent.reason, "no_credits");
});

test("the unlimited plan never runs out", () => {
  for (const feature of FEATURES) {
    if (!planIncludes("yearly", feature)) continue;
    assert.deepEqual(
      canUseFeature("yearly", feature, 0),
      { allowed: true },
      feature,
    );
  }
});

test("every plan's features are drawn from the declared list", () => {
  // Guards against a typo creating an entitlement no gate will ever match.
  for (const id of PLAN_IDS) {
    for (const feature of PLANS[id].features) {
      assert.ok(
        (FEATURES as readonly string[]).includes(feature),
        `${id} grants unknown feature ${feature}`,
      );
    }
  }
});
