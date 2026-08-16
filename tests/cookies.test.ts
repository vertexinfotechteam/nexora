import assert from "node:assert/strict";
import test from "node:test";

import {
  expiredAuthCookie,
  hardenAuthCookie,
  isAuthCookie,
} from "../src/lib/auth/cookies.ts";

/**
 * The session-cookie policy.
 *
 * The requirement these lock down: closing the browser must end the session,
 * so the next visit asks for a password. A cookie only behaves that way when
 * it carries neither Max-Age nor Expires — one stray attribute silently turns
 * it back into a cookie that survives a restart, and nothing else in the app
 * would fail to make that visible.
 */

test("a proposed Max-Age is stripped, so the cookie dies with the browser", () => {
  const result = hardenAuthCookie({ maxAge: 60 * 60 * 24 * 30 });
  assert.equal("maxAge" in result, false);
  assert.equal("expires" in result, false);
});

test("a proposed Expires is stripped too", () => {
  const result = hardenAuthCookie({
    expires: new Date("2030-01-01T00:00:00Z"),
    maxAge: 999,
  });
  assert.equal("expires" in result, false);
  assert.equal("maxAge" in result, false);
});

test("the session flags cannot be relaxed by the caller", () => {
  // Supabase proposes its own options; none of them may weaken these.
  const result = hardenAuthCookie({
    httpOnly: false,
    sameSite: "none",
    secure: false,
  });
  assert.equal(result.httpOnly, true, "must stay out of reach of scripts");
  assert.equal(result.sameSite, "lax", "must not ride along with cross-site posts");
});

test("path defaults to the whole site but an explicit one is kept", () => {
  assert.equal(hardenAuthCookie().path, "/");
  assert.equal(hardenAuthCookie({ path: "/auth" }).path, "/auth");
});

test("unrelated options survive", () => {
  const result = hardenAuthCookie({ domain: "example.com", maxAge: 10 });
  assert.equal(result.domain, "example.com");
  assert.equal("maxAge" in result, false);
});

test("deletion repeats the attributes the cookie was written with", () => {
  // A cookie is only replaced when name, path and domain match. A delete that
  // forgets the path leaves the original in place and the user signed in.
  const result = expiredAuthCookie();
  assert.equal(result.path, "/");
  assert.equal(result.httpOnly, true);
  assert.equal(result.sameSite, "lax");
  assert.equal(result.maxAge, 0);
  assert.ok(result.expires instanceof Date);
  assert.ok((result.expires as Date).getTime() <= 0);
});

test("every cookie that carries a session is recognised", () => {
  // Supabase splits a large session across numbered chunks; missing one is
  // enough to leave a fragment of the session behind on sign-out.
  assert.equal(isAuthCookie("sb-msshcnihasxydrkfrrfz-auth-token"), true);
  assert.equal(isAuthCookie("sb-msshcnihasxydrkfrrfz-auth-token.0"), true);
  assert.equal(isAuthCookie("sb-msshcnihasxydrkfrrfz-auth-token.1"), true);
  assert.equal(isAuthCookie("nx_local_session"), true);

  assert.equal(isAuthCookie("theme"), false);
  assert.equal(isAuthCookie("_ga"), false);
});
