"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Field, PasswordField, SocialButtons, TextField } from "./field";
import type { AuthState } from "@/lib/auth/actions";

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

function Notice({ state }: { state: AuthState }) {
  if (!state?.error && !state?.success) return null;
  const isError = Boolean(state.error);
  return (
    <div
      role="alert"
      className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed ${
        isError
          ? "border-[var(--nx-error-border)] bg-[var(--nx-error-soft)] text-[var(--nx-error-fg)]"
          : "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-fg)]"
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-px h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
      )}
      <span>{state.error ?? state.success}</span>
    </div>
  );
}

function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--nx-purple)] text-[14px] font-semibold text-white transition-colors hover:bg-[var(--nx-purple-hover)] active:bg-[var(--nx-purple-active)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Working…" : label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Sign in                                                                    */
/* -------------------------------------------------------------------------- */

export function LoginForm({
  action,
  oauthAction,
  localModeAction,
  supabaseConfigured,
  next,
  resetDone,
}: {
  action: Action;
  oauthAction: (formData: FormData) => void;
  localModeAction: () => Promise<void>;
  supabaseConfigured: boolean;
  next: string;
  resetDone: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 mb-6 text-[13.5px] text-[var(--nx-text-muted)]">
        Sign in to your Nexus account.
      </p>

      {resetDone ? (
        <div className="mb-4 rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] px-3 py-2.5 text-[12.5px] text-[var(--nx-success-fg)]">
          Your password has been updated. Sign in with it now.
        </div>
      ) : null}

      <Notice state={state} />

      <SocialButtons
        action={oauthAction}
        disabled={!supabaseConfigured}
        label="or sign in with email"
      />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <Field label="Email or username" required htmlFor="identifier">
          <TextField
            id="identifier"
            name="identifier"
            autoComplete="username"
            required
            disabled={!supabaseConfigured}
            placeholder="you@company.com"
          />
        </Field>

        <div>
          <Field label="Password" required htmlFor="password">
            <PasswordField
              id="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={!supabaseConfigured}
              placeholder="••••••••••"
            />
          </Field>
          <div className="mt-1.5 text-right">
            <Link
              href="/forgot-password"
              className="text-[12.5px] font-medium text-[var(--nx-purple)] hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </div>

        <SubmitButton label="Sign in" pending={pending} />
      </form>

      {!supabaseConfigured ? (
        <div className="mt-6 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-inset)] p-4">
          <p className="text-[12.5px] leading-relaxed text-[var(--nx-text-muted)]">
            Supabase is not connected yet, so there are no accounts. You can
            still use the full analysis engine locally — your data stays on this
            machine.
          </p>
          <form action={localModeAction} className="mt-3">
            <button
              type="submit"
              className="h-10 w-full rounded-lg bg-[var(--nx-purple)] text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--nx-purple-hover)]"
            >
              Continue in local mode
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-6 text-center text-[13px] text-[var(--nx-text-muted)]">
          New to Nexus?{" "}
          <Link
            href="/signup"
            className="font-semibold text-[var(--nx-purple)] hover:underline"
          >
            Create a free account
          </Link>
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sign up                                                                    */
export function ForgotPasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-tight">
        Reset your password
      </h1>
      <p className="mt-1.5 mb-6 text-[13.5px] leading-relaxed text-[var(--nx-text-muted)]">
        Enter the email address on your account and we will send a reset link.
      </p>

      <Notice state={state} />

      <form action={formAction} className="space-y-4">
        <Field label="Email" required htmlFor="email">
          <TextField
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </Field>
        <SubmitButton label="Send reset link" pending={pending} />
      </form>

      <p className="mt-6 text-center text-[13px] text-[var(--nx-text-muted)]">
        <Link
          href="/login"
          className="font-semibold text-[var(--nx-purple)] hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-tight">
        Choose a new password
      </h1>
      <p className="mt-1.5 mb-6 text-[13.5px] text-[var(--nx-text-muted)]">
        This link works once and expires shortly.
      </p>

      <Notice state={state} />

      <form action={formAction} className="space-y-4">
        <Field label="New password" required htmlFor="password">
          <PasswordField
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>

        <Field label="Confirm new password" required htmlFor="confirmPassword">
          <PasswordField
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>

        <p className="text-[11.5px] text-[var(--nx-text-muted)]">
          At least 10 characters, with upper case, lower case and a number.
        </p>

        <SubmitButton label="Update password" pending={pending} />
      </form>
    </div>
  );
}
