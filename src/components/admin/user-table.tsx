"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BadgeCheck,
  KeyRound,
  MoreHorizontal,
  Search,
  ShieldOff,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import {
  resetUserPasswordAction,
  revokeUserSessionsAction,
  setUserStateAction,
  verifyUserEmailAction,
} from "@/app/(app)/admin/user-actions";
import { can, type Permission, type PlatformRole } from "@/lib/admin/rbac";
import type { AdminUserRow } from "@/lib/admin/platform";

/**
 * Account management.
 *
 * Buttons the operator's role does not permit are not rendered at all, rather
 * than rendered disabled: a greyed-out control invites a support request about
 * why it is greyed out. The server checks the same permission again regardless
 * — this is presentation, not enforcement.
 */

type PendingAction =
  | { kind: "suspend"; user: AdminUserRow }
  | { kind: "activate"; user: AdminUserRow }
  | { kind: "ban"; user: AdminUserRow }
  | { kind: "reset"; user: AdminUserRow }
  | { kind: "verify"; user: AdminUserRow }
  | { kind: "revoke"; user: AdminUserRow }
  | null;

const STATE_TONE = {
  active: "success",
  suspended: "warning",
  banned: "error",
} as const;

export function UserTable({
  users,
  role,
}: {
  users: AdminUserRow[];
  role: PlatformRole;
}) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"all" | "active" | "suspended" | "banned">("all");
  const [pending, setPending] = useState<PendingAction>(null);
  const [, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const allow = (permission: Permission) => can(role, permission);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (state !== "all" && user.state !== state) return false;
      if (!term) return true;
      return [user.email, user.username, user.displayName, user.workspaceName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(term));
    });
  }, [users, search, state]);

  const run = async (reason: string): Promise<{ ok: boolean; error?: string }> => {
    if (!pending) return { ok: false, error: "Nothing to do." };
    const { kind, user } = pending;

    const result =
      kind === "suspend"
        ? await setUserStateAction(user.userId, "suspended", reason)
        : kind === "ban"
          ? await setUserStateAction(user.userId, "banned", reason)
          : kind === "activate"
            ? await setUserStateAction(user.userId, "active", reason)
            : kind === "reset"
              ? await resetUserPasswordAction(user.userId, user.email ?? "")
              : kind === "verify"
                ? await verifyUserEmailAction(user.userId)
                : await revokeUserSessionsAction(user.userId);

    if (result.ok) {
      setNotice(confirmationCopy(kind, user));
      startTransition(() => setPending(null));
    }
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <span className="text-[10.5px] text-[var(--nx-text-faint)]">
          {visible.length} of {users.length}
        </span>
      </CardHeader>

      <CardBody className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--nx-border)] px-3 py-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--nx-text-faint)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email, name or workspace"
              aria-label="Search users"
              className="h-8 w-full rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] pl-8 pr-2 text-[12px] outline-none focus:border-[var(--nx-accent)]"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["all", "active", "suspended", "banned"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setState(value)}
                className={`h-7 rounded-md px-2 text-[11.5px] capitalize transition-colors ${
                  state === value
                    ? "bg-[var(--nx-accent-soft)] font-medium text-[var(--nx-accent-fg-on-soft)]"
                    : "text-[var(--nx-text-muted)] hover:bg-[var(--nx-hover)]"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {notice ? (
          <p
            role="status"
            className="border-b border-[var(--nx-border)] bg-[var(--nx-success-soft)] px-3 py-2 text-[12px] text-[var(--nx-success-fg)]"
          >
            {notice}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-[var(--nx-text-muted)]">
            {users.length === 0
              ? "No accounts found. Once people sign up they appear here."
              : "No account matches that search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-[var(--nx-text-muted)]">
                  {["Account", "Status", "Workspace", "Plan", "Joined", "Last seen", ""].map(
                    (header) => (
                      <th
                        key={header}
                        className="whitespace-nowrap border-b border-[var(--nx-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.userId} className="hover:bg-[var(--nx-hover)]">
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2">
                      <p className="font-medium">
                        {user.displayName ?? user.username ?? "—"}
                      </p>
                      <p className="flex items-center gap-1 text-[10.5px] text-[var(--nx-text-muted)]">
                        {user.email ?? "no email"}
                        {user.emailConfirmed ? (
                          <BadgeCheck
                            className="h-3 w-3 text-[var(--nx-success)]"
                            aria-label="Email confirmed"
                          />
                        ) : null}
                      </p>
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2">
                      <Badge tone={STATE_TONE[user.state]}>{user.state}</Badge>
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 text-[var(--nx-text-muted)]">
                      {user.workspaceName ?? "—"}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 uppercase text-[var(--nx-text-muted)]">
                      {user.plan ?? "—"}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 text-[var(--nx-text-muted)]">
                      {user.createdAt ? relativeTime(user.createdAt) : "—"}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 text-[var(--nx-text-muted)]">
                      {user.lastSignInAt ? relativeTime(user.lastSignInAt) : "never"}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-2 py-2 text-right">
                      <RowMenu
                        user={user}
                        allow={allow}
                        onPick={(kind) => setPending({ kind, user } as PendingAction)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      {pending ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          {...dialogCopy(pending)}
          onConfirm={run}
        />
      ) : null}
    </Card>
  );
}

function RowMenu({
  user,
  allow,
  onPick,
}: {
  user: AdminUserRow;
  allow: (permission: Permission) => boolean;
  onPick: (kind: NonNullable<PendingAction>["kind"]) => void;
}) {
  const canSuspend = allow("users.suspend");
  const canReset = allow("users.reset_password");
  const canUpdate = allow("users.update");
  const canRevoke = allow("security.revoke_session");

  if (!canSuspend && !canReset && !canUpdate && !canRevoke) {
    return <span className="text-[10.5px] text-[var(--nx-text-faint)]">View only</span>;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${user.email ?? user.userId}`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--nx-text-dim)] hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[190px] rounded-md border border-[var(--nx-border)] bg-[var(--nx-card)] p-1 text-[12px] shadow-xl"
        >
          {canUpdate && !user.emailConfirmed ? (
            <Item icon={BadgeCheck} onSelect={() => onPick("verify")}>
              Mark email verified
            </Item>
          ) : null}

          {canReset && user.email ? (
            <Item icon={KeyRound} onSelect={() => onPick("reset")}>
              Send password reset
            </Item>
          ) : null}

          {canRevoke ? (
            <Item icon={LogOut} onSelect={() => onPick("revoke")}>
              End all sessions
            </Item>
          ) : null}

          {canSuspend ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--nx-border)]" />
              {user.state === "active" ? (
                <>
                  <Item icon={ShieldOff} danger onSelect={() => onPick("suspend")}>
                    Suspend account
                  </Item>
                  <Item icon={ShieldOff} danger onSelect={() => onPick("ban")}>
                    Ban account
                  </Item>
                </>
              ) : (
                <Item icon={ShieldCheck} onSelect={() => onPick("activate")}>
                  Reactivate account
                </Item>
              )}
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({
  icon: Icon,
  children,
  onSelect,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-[var(--nx-elevated)] ${
        danger
          ? "text-[var(--nx-error)] data-[highlighted]:text-[var(--nx-error)]"
          : "text-[var(--nx-text-muted)] data-[highlighted]:text-[var(--nx-text)]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </DropdownMenu.Item>
  );
}

function label(user: AdminUserRow): string {
  return user.email ?? user.username ?? user.userId;
}

function dialogCopy(pending: NonNullable<PendingAction>) {
  const { kind, user } = pending;
  const who = label(user);

  switch (kind) {
    case "suspend":
      return {
        title: "Suspend this account?",
        description: `${who} will be signed out and unable to sign in until reactivated. Their data is kept.`,
        confirmLabel: "Suspend",
        destructive: true,
        typeToConfirm: who,
        reasonLabel: "Why (optional)",
      };
    case "ban":
      return {
        title: "Ban this account?",
        description: `${who} will be permanently blocked from signing in. Their data is kept and the ban can be lifted later.`,
        confirmLabel: "Ban",
        destructive: true,
        typeToConfirm: who,
        reasonLabel: "Why (optional)",
      };
    case "activate":
      return {
        title: "Reactivate this account?",
        description: `${who} will be able to sign in again.`,
        confirmLabel: "Reactivate",
        destructive: false,
        reasonLabel: "Why (optional)",
      };
    case "reset":
      return {
        title: "Send a password reset?",
        description: `A reset link goes to ${who}. You will not see or set their password — only they can complete it.`,
        confirmLabel: "Send link",
        destructive: false,
      };
    case "verify":
      return {
        title: "Mark this email as verified?",
        description: `${who} will be treated as having confirmed their address. Only do this when you have confirmed it another way.`,
        confirmLabel: "Mark verified",
        destructive: false,
      };
    case "revoke":
      return {
        title: "End all sessions?",
        description: `${who} will be signed out everywhere immediately and must sign in again.`,
        confirmLabel: "End sessions",
        destructive: true,
      };
  }
}

function confirmationCopy(
  kind: NonNullable<PendingAction>["kind"],
  user: AdminUserRow,
): string {
  const who = label(user);
  switch (kind) {
    case "suspend":
      return `${who} is suspended.`;
    case "ban":
      return `${who} is banned.`;
    case "activate":
      return `${who} can sign in again.`;
    case "reset":
      return `A password reset link was sent to ${who}.`;
    case "verify":
      return `${who} is marked verified.`;
    case "revoke":
      return `All sessions for ${who} were ended.`;
  }
}
