"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
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
      className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--nx-purple)] text-[14px] font-semibold text-[var(--nx-purple-on)] transition-colors hover:bg-[var(--nx-purple-hover)] active:bg-[var(--nx-purple-active)] disabled:cursor-not-allowed disabled:opacity-60"
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
      <h1 className="text-center text-[26px] font-semibold tracking-tight">
        Welcome Back!
      </h1>
      <p className="mt-1.5 mb-6 text-center text-[13.5px] text-[var(--nx-text-muted)]">
        Sign in to continue to your account
      </p>

      {resetDone ? (
        <div className="mb-4 rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] px-3 py-2.5 text-[12.5px] text-[var(--nx-success-fg)]">
          Your password has been updated. Sign in with it now.
        </div>
      ) : null}

      <Notice state={state} />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <Field label="Email or username" required htmlFor="identifier">
          {/*
            defaultValue, keyed on the returned identifier.

            React resets a form once its action resolves, so a mistyped
            password used to wipe the email as well and the whole thing had to
            be retyped — which reads as the form rejecting an address it had
            just accepted. Restoring it here means only the password is
            cleared, which is the field that was actually wrong. The key forces
            a fresh input so the restored value wins over the reset.
          */}
          <TextField
            key={state?.identifier ?? "identifier"}
            id="identifier"
            name="identifier"
            defaultValue={state?.identifier ?? ""}
            autoComplete="username"
            required
            disabled={!supabaseConfigured}
            placeholder="you@company.com"
            icon={Mail}
          />
        </Field>

        <Field label="Password" required htmlFor="password">
          <PasswordField
            id="password"
            name="password"
            autoComplete="current-password"
            required
            disabled={!supabaseConfigured}
            placeholder="••••••••"
            icon={Lock}
          />
        </Field>

        {/*
          There was a "Remember me" checkbox here. It carried no name, so it
          was never submitted and never did anything — and now that the session
          ends when the browser closes, it would be a promise the product
          cannot keep. Replaced with a plain statement of what happens.
        */}
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[12px] text-[var(--nx-text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--nx-accent)]" />
            You stay signed in until you close this browser.
          </p>
          <Link
            href="/forgot-password"
            className="shrink-0 text-[12.5px] font-medium text-[var(--nx-purple)] hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <SubmitButton label="Sign in" pending={pending} />
      </form>

      <div className="mt-5">
        <SocialButtons
          action={oauthAction}
          disabled={!supabaseConfigured}
          label="or continue with"
        />
      </div>

      {!supabaseConfigured ? (
        <div className="mt-1 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-inset)] p-4">
          <p className="text-[12.5px] leading-relaxed text-[var(--nx-text-muted)]">
            Supabase is not connected yet, so there are no accounts. You can
            still use the full analysis engine locally — your data stays on this
            machine.
          </p>
          <form action={localModeAction} className="mt-3">
            <button
              type="submit"
              className="h-10 w-full rounded-lg bg-[var(--nx-purple)] text-[13.5px] font-semibold text-[var(--nx-purple-on)] transition-colors hover:bg-[var(--nx-purple-hover)]"
            >
              Continue in local mode
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-5 text-center text-[13px] text-[var(--nx-text-muted)]">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-[var(--nx-purple)] hover:underline"
          >
            Create account
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
            minLength={7}
          />
        </Field>

        <Field label="Confirm new password" required htmlFor="confirmPassword">
          <PasswordField
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={7}
          />
        </Field>

        <p className="text-[11.5px] text-[var(--nx-text-muted)]">
          At least 7 characters, with upper case, lower case and a number.
        </p>

        <SubmitButton label="Update password" pending={pending} />
      </form>
    </div>
  );
}
