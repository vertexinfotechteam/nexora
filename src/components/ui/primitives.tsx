import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "nx-lift rounded-[14px] border border-[var(--nx-border)] bg-[var(--nx-card)] shadow-[0_1px_2px_rgba(28,26,23,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-3 border-b border-[var(--nx-border)] px-4 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "flex items-center gap-1.5 text-[13px] font-semibold text-[var(--nx-text)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--nx-elevated)] text-[var(--nx-text-muted)]",
        purple: "bg-[var(--nx-purple-soft)] text-[var(--nx-purple-fg)]",
        cyan: "bg-[var(--nx-cyan-soft)] text-[var(--nx-cyan-fg)]",
        success: "bg-[var(--nx-success-soft)] text-[var(--nx-success-fg)]",
        warning: "bg-[var(--nx-accent-soft-strong)] text-[var(--nx-warning-fg)]",
        error: "bg-[var(--nx-error-soft)] text-[var(--nx-error-fg)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props} />
  );
}

/* -------------------------------------------------------------------------- */
/* Input / Textarea / Label                                                   */
/* -------------------------------------------------------------------------- */

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 text-[13px] text-[var(--nx-text)] outline-none transition-colors",
        "placeholder:text-[var(--nx-text-faint)]",
        "focus:border-[var(--nx-purple)] focus:ring-1 focus:ring-[var(--nx-purple)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-[var(--nx-error)]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 py-2 text-[13px] leading-relaxed text-[var(--nx-text)] outline-none transition-colors",
        "placeholder:text-[var(--nx-text-faint)]",
        "focus:border-[var(--nx-purple)] focus:ring-1 focus:ring-[var(--nx-purple)]",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[12px] font-medium text-[var(--nx-text-muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1 text-[11px] text-[var(--nx-error)]">
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded bg-[var(--nx-elevated)]", className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state — shown instead of fabricated analytics                        */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--nx-border)] px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--nx-border-subtle)] text-[var(--nx-text-muted)]">
          {icon}
        </div>
      ) : null}
      <p className="text-[13px] font-medium text-[var(--nx-text)]">{title}</p>
      {description ? (
        <p className="max-w-sm text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section label                                                              */
/* -------------------------------------------------------------------------- */

export function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--nx-text-muted)]",
        className,
      )}
      {...props}
    />
  );
}
