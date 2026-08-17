import assert from "node:assert/strict";
import test from "node:test";

import {
  boundedString,
  isExportFormat,
  isShareToken,
  isUuid,
  stripControlChars,
} from "../src/lib/security/validate.ts";

/**
 * Shape checks for values that arrive from a URL or a form.
 *
 * The cases below are the ones that were reaching the database before this
 * existed, where a malformed id produced a 500 rather than a 404.
 */

test("a real uuid is accepted in either case", () => {
  assert.equal(isUuid("d17b4cda-5465-4147-bdb7-c76571d71c96"), true);
  assert.equal(isUuid("D17B4CDA-5465-4147-BDB7-C76571D71C96"), true);
});

test("the ids that used to reach Postgres are refused here", () => {
  for (const bad of [
    "not-a-uuid",
    "xyz",
    "'; DROP TABLE datasets;--",
    "../../etc/passwd",
    "%00",
    "d17b4cda-5465-4147-bdb7",              // truncated
    "d17b4cda54654147bdb7c76571d71c96",     // no dashes
    "g17b4cda-5465-4147-bdb7-c76571d71c96", // g is not hex
    " d17b4cda-5465-4147-bdb7-c76571d71c96",
    "",
  ]) {
    assert.equal(isUuid(bad), false, bad || "(empty)");
  }
});

test("non-strings are refused rather than coerced", () => {
  for (const bad of [null, undefined, 123, {}, [], true]) {
    assert.equal(isUuid(bad), false, String(bad));
  }
});

test("share tokens must look like something we issued", () => {
  assert.equal(isShareToken("abcDEF123_-abcDEF123"), true);

  assert.equal(isShareToken("short"), false, "too short to be ours");
  assert.equal(isShareToken("a".repeat(200)), false, "unbounded work");
  assert.equal(isShareToken("has spaces in it here"), false);
  assert.equal(isShareToken("../../../etc/passwd-aaaaaaaa"), false);
  assert.equal(isShareToken("token+with/base64=chars"), false, "not URL-safe");
});

test("only the formats the app produces are accepted", () => {
  assert.equal(isExportFormat("pdf"), true);
  assert.equal(isExportFormat("excel"), true);

  assert.equal(isExportFormat("PDF"), false, "casing is not guessed at");
  assert.equal(isExportFormat("csv"), false);
  assert.equal(isExportFormat("../pdf"), false);
  assert.equal(isExportFormat(""), false);
});

test("bounded strings refuse rather than truncate", () => {
  // Silently shortening stores something the user did not write — a clipped
  // invoice line surfaces as a bug much later, somewhere else.
  assert.equal(boundedString("  hello  ", 10), "hello");
  assert.equal(boundedString("x".repeat(11), 10), null);
  assert.equal(boundedString("", 10), null);
  assert.equal(boundedString("   ", 10), null);
  assert.equal(boundedString(42, 10), null);
  assert.equal(boundedString("ab", 10, { min: 3 }), null);
});

test("control characters are stripped, real whitespace is kept", () => {
  const line = "Logo design\t2\t15000";
  assert.equal(stripControlChars(line), line, "tabs survive");

  const paragraph = "First line\nSecond line\r\nThird";
  assert.equal(stripControlChars(paragraph), paragraph, "newlines survive");

  // Built from char codes rather than pasted in. Literal control bytes make
  // this file binary to git and grep, which is how the last one got missed.
  const NUL = String.fromCharCode(0);
  const BEL = String.fromCharCode(7);
  const DEL = String.fromCharCode(127);

  assert.equal(
    stripControlChars(`clean${NUL}null${BEL}bell${DEL}del`),
    "cleannullbelldel",
    "controls removed",
  );
});
