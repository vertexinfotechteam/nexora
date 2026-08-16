import { Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import {
  PERMISSIONS,
  PLATFORM_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  can,
  type Permission,
  type PlatformRole,
} from "@/lib/admin/rbac";

/**
 * The permission matrix, rendered from the same table the server enforces.
 *
 * Generated rather than written out, so the page cannot drift from the rules.
 * A hand-maintained matrix is worse than none: it is read as authoritative
 * while quietly describing a system that no longer exists.
 */
export function RolesPanel({ currentRole }: { currentRole: PlatformRole }) {
  const groups = groupPermissions();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles and permissions</CardTitle>
        <span className="text-[10.5px] text-[var(--nx-text-faint)]">
          You are {ROLE_LABELS[currentRole]}
        </span>
      </CardHeader>
      <CardBody className="p-0">
        <div className="grid gap-2 border-b border-[var(--nx-border)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_ROLES.map((role) => (
            <div
              key={role}
              className={`rounded-lg border p-2.5 ${
                role === currentRole
                  ? "border-[var(--nx-accent-border)] bg-[var(--nx-accent-soft)]"
                  : "border-[var(--nx-border)]"
              }`}
            >
              <p className="text-[12.5px] font-semibold">{ROLE_LABELS[role]}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--nx-text-muted)]">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr>
                <th className="border-b border-[var(--nx-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--nx-text-muted)]">
                  Permission
                </th>
                {PLATFORM_ROLES.map((role) => (
                  <th
                    key={role}
                    className="whitespace-nowrap border-b border-[var(--nx-border)] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--nx-text-muted)]"
                  >
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, permissions]) => (
                <Fragment key={group}>
                  <tr>
                    <td
                      colSpan={PLATFORM_ROLES.length + 1}
                      className="border-b border-[var(--nx-border-subtle)] bg-[var(--nx-inset)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--nx-text-dim)]"
                    >
                      {group}
                    </td>
                  </tr>
                  {permissions.map((permission) => (
                    <tr key={permission} className="hover:bg-[var(--nx-hover)]">
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                        {permission}
                      </td>
                      {PLATFORM_ROLES.map((role) => (
                        <td
                          key={role}
                          className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-center"
                        >
                          {can(role, permission) ? (
                            <Check
                              className="mx-auto h-3.5 w-3.5 text-[var(--nx-success)]"
                              aria-label="allowed"
                            />
                          ) : (
                            <Minus
                              className="mx-auto h-3.5 w-3.5 text-[var(--nx-text-faint)]"
                              aria-label="not allowed"
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

/** Groups by the segment before the dot: "users.read" -> "users". */
function groupPermissions(): [string, Permission[]][] {
  const map = new Map<string, Permission[]>();
  for (const permission of PERMISSIONS) {
    const group = permission.split(".")[0];
    map.set(group, [...(map.get(group) ?? []), permission]);
  }
  return [...map.entries()];
}
