"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { Field, PasswordField, TextField } from "./field";
import { adminSignInAction, type AdminAuthState } from "@/lib/auth/admin-actions";
import { COMPANY } from "@/lib/team";

/**
 * The operations sign-in.
 *
 * Visually separate from the customer screens on purpose: someone who has
 * arrived here by accident should be able to tell within a second that it is
 * not their sign-in, and be pointed at the right one.
 */
export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<AdminAuthState, FormData>(
    adminSignInAction,
    null,
  );

  return (
    <div>
      <div className="mb-5 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--nx-accent-border)] bg-[var(--nx-accent-soft)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--nx-accent-fg-on-soft)]">
          <ShieldCheck className="h-4 w-4" />
          Nexus operations
        </span>
      </div>

      <p className="mb-6 text-center text-[13px] leading-relaxed text-[var(--nx-text-muted)]">
        Staff sign-in. If you are a customer looking for your account, use the{" "}
        <Link href="/login" className="font-medium text-[var(--nx-accent)] hover:underline">
          regular sign-in
        </Link>{" "}
        instead.
      </p>

      {state?.error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-[var(--nx-error-border)] bg-[var(--nx-error-soft)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--nx-error-fg)]"
        >
          <AlertCircle className="mt-px h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <Field label="Staff email" required htmlFor="admin-email">
          {/* Keyed on the returned value so the address survives a failed
              attempt — React resets the form once the action resolves. */}
          <TextField
            key={state?.email ?? "admin-email"}
            id="admin-email"
            name="email"
            type="email"
            defaultValue={state?.email ?? ""}
            autoComplete="username"
            required
            placeholder="you@vertexinfotech.team"
            icon={Mail}
          />
        </Field>

        <Field label="Password" required htmlFor="admin-password">
          <PasswordField
            id="admin-password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            icon={Lock}
          />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--nx-purple)] text-[14px] font-semibold text-[var(--nx-purple-on)] transition-colors hover:bg-[var(--nx-purple-hover)] active:bg-[var(--nx-purple-active)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Checking…" : "Sign in to operations"}
        </button>
      </form>

      <p className="mt-5 text-center text-[11.5px] leading-relaxed text-[var(--nx-text-faint)]">
        Access is limited to {COMPANY.name} staff. Every attempt is recorded.
      </p>
    </div>
  );
}
