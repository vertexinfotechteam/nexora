"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteViewAction } from "@/app/(app)/dashboards/actions";

/**
 * Deletes a view after confirming.
 *
 * The tiles go with it, but nothing that produced them does: a tile holds a
 * question about a file, never a copy of the data, so deleting a view never
 * touches an upload or a report.
 */
export function DeleteView({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-label={`Delete ${name}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete the view "${name}"? Its tiles are removed. Your files and reports are not affected.`)) {
          return;
        }
        start(async () => {
          const result = await deleteViewAction(id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`"${name}" deleted.`);
          router.refresh();
        });
      }}
      className="shrink-0 rounded-md p-1.5 text-[var(--nx-text-faint)] transition-colors hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-error)] disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
