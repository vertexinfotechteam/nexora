import assert from "node:assert/strict";
import test from "node:test";

import { hit, identify, LIMITS } from "../src/lib/security/rate-limit.ts";

/**
 * The throttle.
 *
 * Its job is to refuse a flood without ever refusing a person working
 * normally, so both halves are pinned down here.
 */

test("requests inside the budget are allowed, and the count is reported", () => {
  const key = `t1:${process.pid}`;
  for (let i = 1; i <= 5; i++) {
    const result = hit(key, 5, 60_000);
    assert.equal(result.allowed, true, `request ${i} should pass`);
    assert.equal(result.remaining, 5 - i);
  }
});

test("the request past the budget is refused, with a wait", () => {
  const key = `t2:${process.pid}`;
  for (let i = 0; i < 3; i++) hit(key, 3, 60_000);

  const denied = hit(key, 3, 60_000);
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
  assert.ok(denied.retryAfter > 0, "must say how long to wait");
});

test("the window reopens once it has passed", () => {
  const key = `t3:${process.pid}`;
  // A 1ms window, exhausted, then allowed again after it lapses.
  assert.equal(hit(key, 1, 1).allowed, true);
  const immediately = hit(key, 1, 1);

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.equal(hit(key, 1, 1).allowed, true, "a fresh window must allow");
      // The second call inside the same 1ms window may or may not land before
      // it lapses, so only the reopening is asserted, not the refusal.
      void immediately;
      resolve();
    }, 20);
  });
});

test("separate keys hold separate budgets", () => {
  const a = `t4a:${process.pid}`;
  const b = `t4b:${process.pid}`;
  for (let i = 0; i < 3; i++) hit(a, 3, 60_000);

  assert.equal(hit(a, 3, 60_000).allowed, false, "a is spent");
  assert.equal(hit(b, 3, 60_000).allowed, true, "b is untouched");
});

test("a signed-in user is counted by account, not by address", () => {
  // Otherwise everyone behind one office connection shares a budget, and one
  // colleague's activity locks out the rest.
  const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
  assert.equal(identify(headers, "user-123"), "user:user-123");
  assert.equal(identify(headers, null), "ip:203.0.113.9");
});

test("the first forwarded address is used, not the whole chain", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178",
  });
  assert.equal(identify(headers, null), "ip:203.0.113.9");
});

test("a caller with no address at all still gets a bucket", () => {
  // Falling back to a shared "unknown" bucket is deliberate: no header must
  // never mean no limit.
  assert.equal(identify(new Headers(), null), "ip:unknown");
});

test("every configured limit is usable and finite", () => {
  for (const [name, config] of Object.entries(LIMITS)) {
    assert.ok(config.limit > 0, `${name} must allow something`);
    assert.ok(config.windowMs > 0, `${name} needs a window`);
    assert.ok(Number.isFinite(config.limit), `${name} must be finite`);
  }
});

test("the sensitive limits are tighter than the ordinary ones", () => {
  // Guards against someone loosening an auth limit to match a read limit.
  assert.ok(LIMITS.login.limit < LIMITS.read.limit);
  assert.ok(LIMITS.adminLogin.limit <= LIMITS.login.limit);
  assert.ok(LIMITS.signup.limit < LIMITS.read.limit);
  assert.ok(LIMITS.ai.limit < LIMITS.read.limit);
});
