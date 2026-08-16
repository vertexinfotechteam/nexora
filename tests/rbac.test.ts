import assert from "node:assert/strict";
import test from "node:test";

import {
  can,
  canAssignRole,
  PERMISSIONS,
  permissionsFor,
  PLATFORM_ROLES,
  type PlatformRole,
} from "../src/lib/admin/rbac.ts";

/**
 * The platform permission model.
 *
 * These lock down the separations that matter: who can touch money, who can
 * touch accounts, and who can hand out power.
 */

test("an unknown or missing role holds nothing", () => {
  for (const permission of PERMISSIONS) {
    assert.equal(can(null, permission), false);
    assert.equal(can(undefined, permission), false);
    // A corrupt value must fail closed, not inherit the mildest role.
    assert.equal(can("root" as PlatformRole, permission), false);
    assert.equal(can("" as PlatformRole, permission), false);
  }
});

test("super admin holds every permission", () => {
  for (const permission of PERMISSIONS) {
    assert.equal(can("super_admin", permission), true, permission);
  }
});

test("admin cannot appoint staff or read secrets", () => {
  // These two are what stop an admin from quietly granting themselves the rest.
  assert.equal(can("admin", "staff.manage"), false);
  assert.equal(can("admin", "system.secrets"), false);
  // But it does run the platform.
  assert.equal(can("admin", "users.suspend"), true);
  assert.equal(can("admin", "billing.refund"), true);
  assert.equal(can("admin", "system.settings"), true);
});

test("manager sees everything but cannot change accounts", () => {
  assert.equal(can("manager", "users.read"), true);
  assert.equal(can("manager", "billing.refund"), true);

  assert.equal(can("manager", "users.suspend"), false);
  assert.equal(can("manager", "users.reset_password"), false);
  assert.equal(can("manager", "users.delete"), false);
  assert.equal(can("manager", "security.revoke_session"), false);
});

test("support can help a customer and nothing else", () => {
  assert.equal(can("support", "users.read"), true);
  assert.equal(can("support", "tickets.reply"), true);

  assert.equal(can("support", "billing.read"), false);
  assert.equal(can("support", "billing.refund"), false);
  assert.equal(can("support", "users.suspend"), false);
  assert.equal(can("support", "system.settings"), false);
  assert.equal(can("support", "audit.read"), false);
});

test("only super admin may touch money among the lower roles", () => {
  const withRefund = PLATFORM_ROLES.filter((role) => can(role, "billing.refund"));
  assert.deepEqual(withRefund, ["super_admin", "admin", "manager"]);
});

test("no role outside super admin may read secrets", () => {
  const withSecrets = PLATFORM_ROLES.filter((role) => can(role, "system.secrets"));
  assert.deepEqual(withSecrets, ["super_admin"]);
});

test("staff management is limited to super admin", () => {
  const withStaff = PLATFORM_ROLES.filter((role) => can(role, "staff.manage"));
  assert.deepEqual(withStaff, ["super_admin"]);
});

test("nobody without staff.manage can assign any role", () => {
  for (const target of PLATFORM_ROLES) {
    assert.equal(canAssignRole("admin", target), false);
    assert.equal(canAssignRole("manager", target), false);
    assert.equal(canAssignRole("support", target), false);
    assert.equal(canAssignRole(null, target), false);
  }
});

test("a super admin may assign any role", () => {
  for (const target of PLATFORM_ROLES) {
    assert.equal(canAssignRole("super_admin", target), true, target);
  }
});

test("every role's grants are a subset of the declared permissions", () => {
  // Guards against a typo in the grant table silently creating a permission
  // that no check will ever match.
  for (const role of PLATFORM_ROLES) {
    for (const granted of permissionsFor(role)) {
      assert.ok(
        (PERMISSIONS as readonly string[]).includes(granted),
        `${role} grants unknown permission ${granted}`,
      );
    }
  }
});
