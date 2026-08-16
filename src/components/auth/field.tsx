"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Form field primitives for the auth screens.
 *
 * Required fields carry a red asterisk that is hidden from screen readers —
 * `required` on the input already conveys that, and a spoken "asterisk" adds
 * noise rather than meaning.
 */

export function Field({
  label,
  required,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[13px] font-medium text-[var(--nx-text)]"
      >
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-[var(--nx-error)]">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-[var(--nx-border)] bg-[var(--nx-card)] px-3.5 text-[13.5px] text-[var(--nx-text)] outline-none transition-colors placeholder:text-[var(--nx-text-faint)] focus:border-[var(--nx-purple)] focus:ring-2 focus:ring-[var(--nx-purple-soft)] disabled:cursor-not-allowed disabled:opacity-60";

export function TextField({
  className,
  icon: Icon,
  ...props
}: React.ComponentProps<"input"> & { icon?: React.ComponentType<{ className?: string }> }) {
  if (!Icon) {
    return <input className={cn(inputClass, className)} {...props} />;
  }
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nx-text-faint)]" />
      <input className={cn(inputClass, "pl-10", className)} {...props} />
    </div>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordField({
  className,
  icon: Icon,
  ...props
}: React.ComponentProps<"input"> & { icon?: React.ComponentType<{ className?: string }> }) {
  const [visible, setVisible] = useState(false);
  const describedBy = useId();

  return (
    <div className="relative">
      {Icon ? (
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nx-text-faint)]" />
      ) : null}
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(inputClass, "pr-11", Icon && "pl-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-describedby={describedBy}
        tabIndex={-1}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[var(--nx-text-dim)] transition-colors hover:text-[var(--nx-text)]"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

/** Google + GitHub buttons. Submit into the OAuth server action. */
export function SocialButtons({
  action,
  disabled,
  label,
}: {
  action: (formData: FormData) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--nx-border)]" />
        <span className="text-[12px] text-[var(--nx-text-muted)]">{label}</span>
        <span className="h-px flex-1 bg-[var(--nx-border)]" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(
          [
            { id: "google", name: "Google" },
            { id: "github", name: "GitHub" },
          ] as const
        ).map((provider) => (
          <form key={provider.id} action={action}>
            <input type="hidden" name="provider" value={provider.id} />
            <button
              type="submit"
              disabled={disabled}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-card)] text-[13.5px] font-medium text-[var(--nx-text)] transition-colors hover:bg-[var(--nx-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {provider.id === "google" ? <GoogleMark /> : <GitHubMark />}
              {provider.name}
            </button>
          </form>
        ))}
      </div>
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2.2c-3.34.72-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.31 3.49 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.64 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.57A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}
