import assert from "node:assert/strict";
import test from "node:test";

import { safeStepDetail } from "../src/lib/ai/orchestrator.ts";
import { AiError } from "../src/lib/ai/provider.ts";

/**
 * What a failed step is allowed to say.
 *
 * The detail written for a step appears in the live activity stream and is
 * printed into the method trail of the PDF the customer downloads. A provider's
 * raw error body used to go straight into both, so a report carried the
 * vendor's JSON, our quota position and the tier we are on.
 *
 * These tests exist because that leak is invisible in normal use: it only
 * appears when the provider fails, which is exactly when nobody is looking at
 * the PDF's fourth page.
 */

/** The body Gemini actually returned, abbreviated only in the URLs. */
const GEMINI_429 =
  'gemini request failed (429): { "error": { "code": 429, "message": "You exceeded ' +
  "your current quota, please check your plan and billing details. For more " +
  "information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. " +
  "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier, limit: 20";

/** Anything that would tell a customer about our vendor, plan or endpoints. */
const FORBIDDEN = [
  "quota",
  "billing",
  "http",
  "googleapis",
  "gemini",
  "anthropic",
  "openai",
  "429",
  "{",
  "limit: 20",
];

function assertClean(detail: string) {
  for (const term of FORBIDDEN) {
    assert.ok(
      !detail.toLowerCase().includes(term.toLowerCase()),
      `step detail must not contain ${JSON.stringify(term)} — got: ${detail}`,
    );
  }
}

test("a rate-limited provider does not put its error body in the report", () => {
  const detail = safeStepDetail(new AiError(GEMINI_429, "gemini", 429), "planner");
  assertClean(detail);
  // Still has to tell the reader the figures are unaffected.
  assert.match(detail, /computed by the engine/i);
});

test("a rejected key does not reveal which provider rejected it", () => {
  assertClean(safeStepDetail(new AiError("gemini request failed (401): bad key", "gemini", 401), "planner"));
});

test("a provider outage reads as an outage", () => {
  const detail = safeStepDetail(new AiError("openai request failed (503): upstream", "openai", 503), "planner");
  assertClean(detail);
  assert.match(detail, /unavailable/i);
});

test("a timeout says so", () => {
  const detail = safeStepDetail(new AiError("gemini request timed out.", "gemini"), "planner");
  assertClean(detail);
  assert.match(detail, /did not respond in time/i);
});

test("an unexpected error does not leak its message either", () => {
  const detail = safeStepDetail(
    new Error("connect ECONNREFUSED 10.0.0.4:5432 while reading secrets"),
    "automatic analysis",
  );
  assert.ok(!detail.includes("10.0.0.4"), `leaked an address: ${detail}`);
  assert.ok(!detail.includes("secrets"), `leaked internals: ${detail}`);
});

test("a non-Error value is handled rather than stringified into the page", () => {
  const detail = safeStepDetail({ token: "sk-live-abcdef" }, "planner");
  assert.ok(!detail.includes("sk-live"), `leaked a token: ${detail}`);
});
