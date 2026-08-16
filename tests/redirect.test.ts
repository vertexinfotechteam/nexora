import assert from "node:assert/strict";
import test from "node:test";

import { resolveSiteOrigin, safeNextPath } from "../src/lib/auth/redirect.ts";

/**
 * Redirect handling.
 *
 * Both functions guard the same class of bug: a value an attacker chooses
 * being used to send a user, or a password-reset link, somewhere off-site.
 */

test("an ordinary in-app path is preserved", () => {
  assert.equal(safeNextPath("/reports"), "/reports");
  assert.equal(safeNextPath("/datasets/42"), "/datasets/42");
  assert.equal(safeNextPath("/explore?tab=rows"), "/explore?tab=rows");
});

test("a missing or empty value falls back", () => {
  assert.equal(safeNextPath(null), "/dashboard");
  assert.equal(safeNextPath(undefined), "/dashboard");
  assert.equal(safeNextPath(""), "/dashboard");
  assert.equal(safeNextPath("   "), "/dashboard");
});

test("absolute URLs are refused", () => {
  assert.equal(safeNextPath("https://evil.com"), "/dashboard");
  assert.equal(safeNextPath("http://evil.com/x"), "/dashboard");
  assert.equal(safeNextPath("javascript:alert(1)"), "/dashboard");
  assert.equal(safeNextPath("data:text/html,<script>"), "/dashboard");
});

test("protocol-relative URLs are refused in both spellings", () => {
  // These start with "/" but browsers read them as another origin, which is
  // exactly what a leading-slash-only check lets through.
  assert.equal(safeNextPath("//evil.com"), "/dashboard");
  assert.equal(safeNextPath("//evil.com/path"), "/dashboard");
  assert.equal(safeNextPath("/\\evil.com"), "/dashboard");
  assert.equal(safeNextPath("/\\/evil.com"), "/dashboard");
});

test("control characters are refused rather than stripped", () => {
  assert.equal(safeNextPath("/\nhttps://evil.com"), "/dashboard");
  assert.equal(safeNextPath("/\rdashboard"), "/dashboard");
  assert.equal(safeNextPath("/\tx"), "/dashboard");
});

test("routes that no longer exist fall back instead of 404ing after sign-in", () => {
  assert.equal(safeNextPath("/onboarding"), "/dashboard");
  assert.equal(safeNextPath("/onboarding/step-2"), "/dashboard");
});

test("emailed links use the configured site URL, not the request origin", () => {
  // The attack: post the forgot-password form with Origin: https://evil.com.
  // The victim's recovery link must not be built from that.
  assert.equal(
    resolveSiteOrigin("https://nexus.example.com", "https://evil.com", true),
    "https://nexus.example.com",
  );
  // A path on the configured URL is reduced to the origin.
  assert.equal(
    resolveSiteOrigin("https://nexus.example.com/app", "https://evil.com", true),
    "https://nexus.example.com",
  );
});

test("with nothing configured, production refuses the request origin", () => {
  // Empty lets Supabase fall back to the Site URL set in its own dashboard,
  // which is safe; echoing the caller's header would not be.
  assert.equal(resolveSiteOrigin(undefined, "https://evil.com", true), "");
});

test("development falls back to the request origin", () => {
  assert.equal(
    resolveSiteOrigin(undefined, "http://localhost:3000", false),
    "http://localhost:3000",
  );
});

test("a malformed site URL does not produce a broken link", () => {
  assert.equal(resolveSiteOrigin("not a url", "http://localhost:3000", false), "http://localhost:3000");
});
