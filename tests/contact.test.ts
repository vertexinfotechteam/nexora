import assert from "node:assert/strict";
import test from "node:test";

import {
  emailIsPlatformStaff,
  parseStaffAllowlist,
} from "../src/lib/platform-staff.ts";

/**
 * The gate in front of visitors' contact messages.
 *
 * This is the only thing standing between a customer and the name, email and
 * message of every stranger who ever used the public form, so the failure
 * modes below are the ones worth pinning down.
 */

test("an unconfigured allowlist matches nobody", () => {
  const allowlist = parseStaffAllowlist(undefined);
  assert.deepEqual(allowlist, []);
  assert.equal(emailIsPlatformStaff("anyone@example.com", allowlist), false);
});

test("an empty string does not become a matchable entry", () => {
  // A trailing comma used to be the risk here: "a@b.com," splits to
  // ["a@b.com", ""], and an empty entry would then match an account whose
  // email is empty or missing.
  const allowlist = parseStaffAllowlist("staff@nexus.com,");
  assert.deepEqual(allowlist, ["staff@nexus.com"]);
  assert.equal(emailIsPlatformStaff("", allowlist), false);
  assert.equal(emailIsPlatformStaff(null, allowlist), false);
  assert.equal(emailIsPlatformStaff(undefined, allowlist), false);
});

test("blank and whitespace-only configuration matches nobody", () => {
  assert.deepEqual(parseStaffAllowlist("   "), []);
  assert.deepEqual(parseStaffAllowlist(",, ,"), []);
  assert.equal(emailIsPlatformStaff("a@b.com", parseStaffAllowlist(",,")), false);
});

test("matching ignores case and surrounding whitespace on both sides", () => {
  const allowlist = parseStaffAllowlist("  Staff@Nexus.com , ops@nexus.com ");
  assert.deepEqual(allowlist, ["staff@nexus.com", "ops@nexus.com"]);
  assert.equal(emailIsPlatformStaff("STAFF@NEXUS.COM", allowlist), true);
  assert.equal(emailIsPlatformStaff("  staff@nexus.com  ", allowlist), true);
  assert.equal(emailIsPlatformStaff("ops@nexus.com", allowlist), true);
});

test("a non-listed address is refused", () => {
  const allowlist = parseStaffAllowlist("staff@nexus.com");
  assert.equal(emailIsPlatformStaff("customer@example.com", allowlist), false);
  // Not a prefix or substring match: these are all distinct addresses.
  assert.equal(emailIsPlatformStaff("staff@nexus.com.evil.com", allowlist), false);
  assert.equal(emailIsPlatformStaff("xstaff@nexus.com", allowlist), false);
  assert.equal(emailIsPlatformStaff("staff@nexus.co", allowlist), false);
});
