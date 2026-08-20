import assert from "node:assert/strict";
import test from "node:test";

import { BILLABLE_KINDS, FREE_PLAN_CREDITS, PLAN_CREDITS } from "../src/lib/credits.ts";

/**
 * What an allowance is spent on.
 *
 * The balance is counted by reading back the same kinds that are written when
 * something is charged. If those two lists ever drift apart the failure is
 * silent and financial: a kind charged but not counted lets an account spend
 * for ever, and a kind counted but never charged shows a balance nobody can
 * explain. These tests pin the list so a third kind cannot be added to one
 * side only.
 */

test("importing a file and running an analysis both spend the allowance", () => {
  assert.ok(BILLABLE_KINDS.includes("dataset_import"), "an import must cost a credit");
  assert.ok(BILLABLE_KINDS.includes("ai_analysis"), "an analysis must cost a credit");
});

test("nothing else is billable", () => {
  // Exports, reads and saved views are deliberately free: they were paid for
  // when the thing they act on was created.
  assert.equal(BILLABLE_KINDS.length, 2, `unexpected billable kinds: ${BILLABLE_KINDS.join(", ")}`);
});

test("the free plan carries ten credits", () => {
  // Ten imports, ten analyses, or any mix of the two.
  assert.equal(FREE_PLAN_CREDITS, 10);
  assert.equal(PLAN_CREDITS.free, 10);
});

test("paid tiers carry more than free, and the top one is effectively unmetered", () => {
  /*
   * Keyed by the session's plan vocabulary (free/pro/business/enterprise),
   * which is a different set of names from the pricing page's
   * (free/monthly/half_yearly/yearly). That divergence is worth knowing about;
   * this test asserts the one that actually meters credits.
   */
  assert.ok(PLAN_CREDITS.pro > PLAN_CREDITS.free);
  assert.ok(PLAN_CREDITS.business > PLAN_CREDITS.pro);
  assert.ok(
    PLAN_CREDITS.enterprise >= 1_000_000,
    "enterprise is sold as unmetered, so its allowance must be effectively unreachable",
  );
});
