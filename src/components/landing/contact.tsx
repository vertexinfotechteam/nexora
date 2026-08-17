"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Mail, MessageSquare, Send, User } from "lucide-react";
import { submitContactAction, type ContactState } from "@/app/actions/contact";
import { Reveal } from "@/components/visual/reveal";
import { COMPANY } from "@/lib/team";

/**
 * "Ask our team" — the public contact form.
 *
 * Everything typed here lands in the admin panel, so the copy sets the
 * expectation that a person reads it rather than a bot.
 */

const initialState: ContactState = {};

export function Contact() {
  const [state, formAction] = useActionState(submitContactAction, initialState);

  return (
    <section id="contact" className="nx-datafield relative scroll-mt-16 py-20">
      <div
        aria-hidden
        className="nx-halo absolute left-1/2 top-1/4 -z-10 h-[360px] w-[620px] -translate-x-1/2 rounded-full blur-[150px]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--nx-logo-green) 20%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="nx-chip inline-flex items-center gap-1.5 rounded-full border border-[var(--nx-border)] bg-[var(--nx-card)] px-3 py-1 text-[11.5px] text-[var(--nx-text-muted)]">
              <MessageSquare className="h-3.5 w-3.5 text-[var(--nx-accent)]" />
              Talk to a human
            </span>
            <h2 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
              Not sure about something?{" "}
              <span className="nx-gradient-text">Ask our team.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-[var(--nx-text-muted)]">
              Questions about how the analysis works, what your data is used
              for, pricing, or whether Nexus fits your case — write to us and
              someone from {COMPANY.name} will read it and reply.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <form
            action={formAction}
            className="nx-card-glow mx-auto mt-10 max-w-2xl rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5 shadow-[var(--nx-shadow)] sm:p-7"
          >
            {state.error || state.success ? (
              <div
                role="status"
                className={`mb-5 flex items-start gap-2 rounded-lg border px-3.5 py-3 text-[12.5px] leading-relaxed ${
                  state.error
                    ? "border-[var(--nx-error-border)] bg-[var(--nx-error-soft)] text-[var(--nx-error)]"
                    : "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success)]"
                }`}
              >
                {state.error ? (
                  <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
                )}
                <span>{state.error ?? state.success}</span>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <ContactField label="Your name" htmlFor="contact-name">
                <Input
                  id="contact-name"
                  name="name"
                  required
                  maxLength={120}
                  autoComplete="name"
                  placeholder="Priya Sharma"
                  icon={User}
                />
              </ContactField>

              <ContactField label="Email" htmlFor="contact-email">
                <Input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="you@company.com"
                  icon={Mail}
                />
              </ContactField>
            </div>

            <ContactField label="What is this about?" htmlFor="contact-subject" className="mt-4">
              <Input
                id="contact-subject"
                name="subject"
                required
                maxLength={160}
                placeholder="Can Nexus read my sales export?"
              />
            </ContactField>

            <ContactField label="Your question" htmlFor="contact-message" className="mt-4">
              <textarea
                id="contact-message"
                name="message"
                required
                minLength={10}
                maxLength={4000}
                rows={5}
                placeholder="Tell us what you are trying to do and where you are stuck."
                className="w-full resize-y rounded-lg border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3.5 py-3 text-[13.5px] leading-relaxed text-[var(--nx-text)] outline-none transition-colors placeholder:text-[var(--nx-text-faint)] focus:border-[var(--nx-accent)] focus:ring-2 focus:ring-[var(--nx-accent-soft)]"
              />
            </ContactField>

            {/*
              Honeypot. Hidden from people and from screen readers, and skipped
              in the tab order, so only an automated form-filler will put
              anything in it.
            */}
            <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="contact-company-website">Do not fill this in</label>
              <input
                id="contact-company-website"
                type="text"
                name="company_website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
                We use your email only to reply. Nothing here is shared with
                anyone outside {COMPANY.name}.
              </p>
              <SubmitButton />
            </div>
          </form>
        </Reveal>
      </div>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="nx-press group inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--nx-purple)] px-5 text-[13.5px] font-medium text-[var(--nx-purple-on)] transition-colors hover:bg-[var(--nx-purple-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sending..." : "Send to our team"}
      <Send className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
    </button>
  );
}

function ContactField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12.5px] font-medium text-[var(--nx-text)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({
  icon: Icon,
  ...props
}: React.ComponentProps<"input"> & {
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const base =
    "h-11 w-full rounded-lg border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3.5 text-[13.5px] text-[var(--nx-text)] outline-none transition-colors placeholder:text-[var(--nx-text-faint)] focus:border-[var(--nx-accent)] focus:ring-2 focus:ring-[var(--nx-accent-soft)]";

  if (!Icon) return <input className={base} {...props} />;

  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nx-text-faint)]" />
      <input className={`${base} pl-10`} {...props} />
    </div>
  );
}
