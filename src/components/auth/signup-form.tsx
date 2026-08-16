"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  User,
  X,
} from "lucide-react";
import { Field, PasswordField, SocialButtons, TextField } from "./field";
import type { AuthState } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

/**
 * Create-account form.
 *
 * Password rules are checked live against the same conditions the server
 * enforces, so the requirements list and the actual validation cannot drift.
 */

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

/** Mirrors passwordSchema in src/lib/auth/actions.ts exactly. */
const PASSWORD_RULES = [
  { id: "length", label: "At least 7 characters", test: (v: string) => v.length >= 7 },
  { id: "lower", label: "A lower case letter", test: (v: string) => /[a-z]/.test(v) },
  { id: "upper", label: "An upper case letter", test: (v: string) => /[A-Z]/.test(v) },
  { id: "number", label: "A number", test: (v: string) => /[0-9]/.test(v) },
] as const;

export function SignupForm({
  action,
  oauthAction,
  supabaseConfigured,
}: {
  action: Action;
  oauthAction: (formData: FormData) => void;
  supabaseConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const passed = useMemo(
    () => PASSWORD_RULES.filter((rule) => rule.test(password)).length,
    [password],
  );
  const strength = password.length === 0 ? 0 : passed;
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <div>
      <h1 className="text-center text-[26px] font-semibold leading-tight tracking-tight">
        Create Account
      </h1>
      <p className="mt-1.5 mb-6 text-center text-[13.5px] leading-relaxed text-[var(--nx-text-muted)]">
        Fill in the details to get started
      </p>

      {/* Server response */}
      {state?.error || state?.success ? (
        <div
          role="alert"
          className={cn(
            "mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed",
            state.error
              ? "border-[var(--nx-error-border)] bg-[var(--nx-error-soft)] text-[var(--nx-error-fg)]"
              : "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-fg)]",
          )}
        >
          {state.error ? (
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
          )}
          <span>{state.error ?? state.success}</span>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <Field label="Full name" required htmlFor="fullName">
          <TextField
            id="fullName"
            name="fullName"
            autoComplete="name"
            required
            maxLength={80}
            placeholder="Priya Sharma"
            icon={User}
          />
        </Field>

        {/*
          No business or workspace field. Creating an account asks for the
          three things an account actually needs; the name printed on invoices
          defaults to the user's own and is changed in Settings > Branding,
          where they can see the logo and signature it sits next to.
        */}

        <Field label="Email address" required htmlFor="email">
          <TextField
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            icon={Mail}
          />
        </Field>

        <Field label="Create password" required htmlFor="password">
          <PasswordField
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={7}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            icon={Lock}
          />
        </Field>

        <div aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {PASSWORD_RULES.map((rule, index) => (
              <span
                key={rule.id}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  index < strength
                    ? strength <= 2
                      ? "bg-[var(--nx-error)]"
                      : strength === 3
                        ? "bg-[var(--nx-warning)]"
                        : "bg-[var(--nx-success)]"
                    : "bg-[var(--nx-border)]",
                )}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-[var(--nx-text-muted)]">
            At least 7 characters, with upper case, lower case and a number.
          </p>
        </div>

        <Field label="Confirm password" required htmlFor="confirmPassword">
          <PasswordField
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={7}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={mismatch}
            icon={Lock}
          />
        </Field>

        {mismatch ? (
          <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--nx-error-fg)]">
            <X className="h-3 w-3 shrink-0" />
            The two passwords do not match.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="acceptedTerms"
            required
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--nx-border-strong)] accent-[var(--nx-purple)]"
          />
          <span className="text-[12.5px] leading-relaxed text-[var(--nx-text-muted)]">
            I agree to the{" "}
            <Link href="/terms" className="font-medium text-[var(--nx-purple)] hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-[var(--nx-purple)] hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--nx-purple)] text-[14px] font-semibold text-[var(--nx-purple-on)] transition-colors hover:bg-[var(--nx-purple-hover)] active:bg-[var(--nx-purple-active)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Creating your account…" : "Create Account"}
        </button>
      </form>

      <div className="mt-5">
        <SocialButtons
          action={oauthAction}
          disabled={!supabaseConfigured}
          label="or sign up with"
        />
      </div>

      <p className="mt-5 text-center text-[13px] text-[var(--nx-text-muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[var(--nx-purple)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
