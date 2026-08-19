"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteAccountAction, setSubscriptionStateAction } from "@/app/operations/actions";
import { setUserStateAction } from "@/app/(app)/admin/user-actions";

/**
 * Every action on an account, behind one shared reason.
 *
 * The reason sits above the controls rather than inside a confirmation dialog
 * because it applies to all of them, and because writing down why comes before
 * deciding what — an operator who cannot finish the sentence usually should
 * not press the button.
 *
 * Deletion additionally asks for the account's own email to be typed. It is the
 * one action here that cannot be undone, and the difference between suspending
 * and deleting is one row in a table of similar-looking people.
 */
export function ManageAccount({
  userId,
  email,
  organizationId,
  state,
  canSuspend,
  canDelete,
  canBill,
  isSelf,
}: {
  userId: string;
  email: string;
  organizationId: string | null;
  state: "active" | "suspended" | "banned";
  canSuspend: boolean;
  canDelete: boolean;
  canBill: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [pending, startTransition] = useTransition();

  const reasonReady = reason.trim().length >= 8;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        after?.();
        router.refresh();
      } else {
        toast.error(result.error ?? "That did not work.");
      }
    });
  };

  const Section = ({ title, note, children }: { title: string; note: string; children: React.ReactNode }) => (
    <section className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">{note}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </section>
  );

  const Action = ({
    label,
    onClick,
    disabled,
    danger,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled || pending || !reasonReady}
      onClick={onClick}
      title={!reasonReady ? "Write a reason first" : undefined}
      className={[
        "rounded-lg border px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        danger
          ? "border-[var(--nx-error)]/45 text-[var(--nx-error)] hover:bg-[var(--nx-error)]/10"
          : "border-[var(--nx-border)] hover:border-[var(--nx-accent)]",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[var(--nx-accent)]/40 bg-[var(--nx-card)] p-4">
        <label htmlFor="ops-reason" className="text-[14px] font-semibold">
          Reason <span className="text-[var(--nx-error)]">*</span>
        </label>
        <p className="mt-1 text-[12px] text-[var(--nx-text-muted)]">
          Every action below writes an audit row with your identity, the reason
          and what changed. Include a ticket reference where there is one.
        </p>
        <textarea
          id="ops-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Customer reported a failed upgrade — INV-2231"
          className="mt-2.5 w-full rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] p-2.5 text-[13px] outline-none focus:border-[var(--nx-accent)]"
        />
        <p className="mt-1 text-[11px] text-[var(--nx-text-faint)]">
          {reasonReady ? "Reason recorded with every action below." : "At least 8 characters. Actions stay disabled until then."}
        </p>
      </section>

      {isSelf ? (
        <p className="rounded-xl border border-[var(--nx-warning)]/35 bg-[var(--nx-warning)]/10 px-4 py-3 text-[12.5px]">
          This is your own account. Suspending and deleting are refused here, so
          an operator cannot lock themselves out of the panel they are standing in.
        </p>
      ) : null}

      {canBill ? (
        <Section
          title="Subscription"
          note="Stops or restores the paid plan while leaving the person able to sign in and read their own data. Suspending sign-in is a separate decision, below."
        >
          <Action label="Suspend billing" onClick={() => organizationId && run(() => setSubscriptionStateAction(organizationId, "suspended", reason))} disabled={!organizationId} />
          <Action label="Reactivate billing" onClick={() => organizationId && run(() => setSubscriptionStateAction(organizationId, "active", reason))} disabled={!organizationId} />
          <Action label="Cancel subscription" onClick={() => organizationId && run(() => setSubscriptionStateAction(organizationId, "cancelled", reason))} disabled={!organizationId} danger />
          {!organizationId ? (
            <p className="w-full text-[11.5px] text-[var(--nx-text-faint)]">
              This account has no workspace, so there is no subscription to change.
            </p>
          ) : null}
        </Section>
      ) : null}

      {canSuspend ? (
        <Section
          title="Account access"
          note="Suspending blocks sign-in immediately and can be undone. The account's data is untouched."
        >
          {state === "active" ? (
            <Action label="Suspend account" onClick={() => run(() => setUserStateAction(userId, "suspended", reason))} disabled={isSelf} danger />
          ) : (
            <Action label="Reactivate account" onClick={() => run(() => setUserStateAction(userId, "active", reason))} disabled={isSelf} />
          )}
        </Section>
      ) : null}

      {canDelete ? (
        <section className="rounded-xl border border-[var(--nx-error)]/40 bg-[var(--nx-error)]/5 p-4">
          <h2 className="text-[14px] font-semibold text-[var(--nx-error)]">Danger zone</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
            Deleting removes the workspace, every dataset, report and analysis in
            it, and the stored files behind them. It cannot be undone, and the
            account&rsquo;s own history goes with it — only the audit row naming
            this deletion survives.
          </p>

          <label htmlFor="ops-confirm" className="mt-3 block text-[12.5px] font-medium">
            Type the account&rsquo;s email to confirm permanent deletion
          </label>
          <input
            id="ops-confirm"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={email}
            autoComplete="off"
            className="mt-1.5 w-full max-w-md rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 py-2 text-[13px] outline-none focus:border-[var(--nx-error)]"
          />
          <p className="mt-1 text-[11px] text-[var(--nx-text-faint)]">
            Type &ldquo;{email}&rdquo; exactly.
          </p>

          <button
            type="button"
            disabled={
              pending || isSelf || !reasonReady ||
              confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase()
            }
            onClick={() => run(
              () => deleteAccountAction(userId, reason, confirmEmail),
              () => router.replace("/operations/accounts"),
            )}
            className="mt-3 rounded-lg bg-[var(--nx-error)] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Working…" : "Permanently delete account"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
