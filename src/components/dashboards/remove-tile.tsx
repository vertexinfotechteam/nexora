"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { removeTileAction } from "@/app/(app)/dashboards/actions";

/** Removes one tile. The file it summarised is untouched. */
export function RemoveTile({
  dashboardId,
  widgetId,
  title,
}: {
  dashboardId: string;
  widgetId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-label={`Remove ${title}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await removeTileAction(dashboardId, widgetId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        })
      }
      className="shrink-0 rounded-md p-1 text-[var(--nx-text-faint)] transition-colors hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-error)] disabled:opacity-50"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
