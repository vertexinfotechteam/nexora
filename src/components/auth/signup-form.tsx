"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Field, PasswordField, SocialButtons, TextField } from "./field";
import type { AuthState } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

/**
 * Create-account form.
 *
 * Two principles drive the layout:
 *
 *   1. Tell the user what will happen before they commit. The panel under the
 *      button states exactly what they get and what we will not do, rather
 *      than leaving them to find out after submitting.
 *   2. Never let the server be the first to say a field is wrong. Password
 *      rules are checked live against the same conditions the server enforces,
 *      so the requirements list and the actual validation cannot drift.
 */

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

/** Mirrors passwordSchema in src/lib/auth/actions.ts exactly. */
const PASSWORD_RULES = [
  { id: "length", label: "At least 10 characters", test: (v: string) => v.length >= 10 },
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
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
        Create your account
      </h1>
      <p className="mt-1.5 mb-5 text-[13.5px] leading-relaxed text-[var(--nx-text-muted)]">
        Ten AI analyses free, every month. No card, no sales call.
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

      <SocialButtons
        action={oauthAction}
        disabled={!supabaseConfigured}
        label="or sign up with email"
      />

      <form action={formAction} className="space-y-4">
        {/* ---- who you are ------------------------------------------------ */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" required htmlFor="fullName">
            <TextField
              id="fullName"
              name="fullName"
              autoComplete="name"
              required
              maxLength={80}
              placeholder="Priya Sharma"
            />
          </Field>

          <Field
            label="Business name"
            required
            htmlFor="businessName"
            hint="Printed on your reports and quotations."
          >
            <TextField
              id="businessName"
              name="businessName"
              autoComplete="organization"
              required
              maxLength={120}
              placeholder="Sharma Design Studio"
            />
          </Field>
        </div>

        <Field
          label="Work email"
          required
          htmlFor="email"
          hint="Used to sign in and to recover your account."
        >
          <TextField
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </Field>

        {/* ---- password --------------------------------------------------- */}
        <Field label="Password" required htmlFor="password">
          <PasswordField
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {/* Strength meter. Four segments, one per rule actually enforced. */}
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

          <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <li
                  key={rule.id}
                  className={cn(
                    "flex items-center gap-1.5 text-[11.5px] transition-colors",
                    ok
                      ? "text-[var(--nx-success-fg)]"
                      : "text-[var(--nx-text-muted)]",
                  )}
                >
                  {ok ? (
                    <Check className="h-3 w-3 shrink-0" />
                  ) : (
                    <span className="h-3 w-3 shrink-0 rounded-full border border-current opacity-40" />
                  )}
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </div>

        <Field label="Confirm password" required htmlFor="confirmPassword">
          <PasswordField
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={10}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={mismatch}
          />
        </Field>

        {mismatch ? (
          <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--nx-error-fg)]">
            <X className="h-3 w-3 shrink-0" />
            The two passwords do not match.
          </p>
        ) : null}

        {/* ---- what you get ----------------------------------------------- */}
        <div className="rounded-lg border border-[var(--nx-border)] bg-[var(--nx-inset)] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-[var(--nx-purple)]" />
            What happens next
          </p>
          <ul className="space-y-1">
            {[
              "Your workspace is created and you go straight to your dashboard",
              "10 AI analysis credits are added — uploads and exports stay free",
              "Your data stays private to your workspace and is never used to train anything",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]"
              >
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--nx-success)]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

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
              Terms of service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-[var(--nx-purple)] hover:underline">
              Privacy policy
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--nx-purple)] text-[14px] font-semibold text-white transition-colors hover:bg-[var(--nx-purple-hover)] active:bg-[var(--nx-purple-active)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Creating your workspace…" : "Create account"}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--nx-text-faint)]">
          <ShieldCheck className="h-3 w-3" />
          Your password is handled by Supabase Auth. Nexus never stores it.
        </p>
      </form>

      <p className="mt-5 text-center text-[13px] text-[var(--nx-text-muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[var(--nx-purple)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
