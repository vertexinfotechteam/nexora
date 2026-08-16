"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * Confirmation for an action that is hard to take back.
 *
 * The destructive path asks the operator to type the target's name. A dialog
 * whose only defence is a button placed under the cursor is dismissed by
 * reflex; typing the name forces a second look at *which* account is about to
 * be changed, which is the mistake worth preventing.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  /** When set, the operator must type this exactly before confirming. */
  typeToConfirm,
  /** Optional free-text reason, recorded in the audit log. */
  reasonLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  typeToConfirm?: string;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = !typeToConfirm || typed.trim() === typeToConfirm;

  const close = (next: boolean) => {
    if (pending) return;
    if (!next) {
      setTyped("");
      setReason("");
      setError(null);
    }
    onOpenChange(next);
  };

  const run = async () => {
    if (!armed || pending) return;
    setPending(true);
    setError(null);
    const result = await onConfirm(reason);
    setPending(false);
    if (result.ok) {
      close(false);
    } else {
      setError(result.error ?? "That did not work.");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            {destructive ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--nx-error-soft)]">
                <AlertTriangle className="h-4 w-4 text-[var(--nx-error)]" />
              </span>
            ) : null}
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[12.5px] leading-relaxed text-[var(--nx-text-muted)]">
                {description}
              </Dialog.Description>
            </div>
          </div>

          {reasonLabel ? (
            <label className="mt-4 block">
              <span className="mb-1 block text-[12px] font-medium">
                {reasonLabel}
              </span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Recorded in the audit log"
                className="h-9 w-full rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2.5 text-[12.5px] outline-none focus:border-[var(--nx-accent)]"
              />
            </label>
          ) : null}

          {typeToConfirm ? (
            <label className="mt-3 block">
              <span className="mb-1 block text-[12px] font-medium">
                Type{" "}
                <code className="rounded bg-[var(--nx-inset)] px-1 py-px font-mono text-[11.5px]">
                  {typeToConfirm}
                </code>{" "}
                to confirm
              </span>
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                className="h-9 w-full rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2.5 text-[12.5px] outline-none focus:border-[var(--nx-accent)]"
              />
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 rounded-md border border-[var(--nx-error-border)] bg-[var(--nx-error-soft)] px-2.5 py-2 text-[12px] text-[var(--nx-error-fg)]">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                className="h-9 rounded-md border border-[var(--nx-border)] px-3 text-[12.5px] hover:bg-[var(--nx-hover)] disabled:opacity-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={run}
              disabled={!armed || pending}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                destructive
                  ? "bg-[var(--nx-error)] hover:brightness-110"
                  : "bg-[var(--nx-purple)] text-[var(--nx-purple-on)] hover:bg-[var(--nx-purple-hover)]"
              }`}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
