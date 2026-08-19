import { Skeleton } from "@/components/ui/primitives";

/**
 * Shown while a page in the app is being prepared on the server.
 *
 * These pages query the workspace before they can render anything, so a click
 * used to leave the previous screen on display with nothing to say work had
 * started — long enough on a slow connection to read as a dead link and
 * invite a second click.
 *
 * This is the route-level fallback Next renders in place of the page while it
 * loads. Only the content area is replaced: the sidebar and top bar belong to
 * the layout and stay put, so the frame holds still and only the part that is
 * actually changing shows movement.
 *
 * The shapes mirror the layout most pages settle into — a title, a row of
 * figures, then a wide panel — so the arriving content lands roughly where the
 * placeholder sat rather than jumping.
 */
export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Page title and its supporting line. */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>

      {/* Summary figures. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-6 w-24" />
            <Skeleton className="mt-2 h-2.5 w-16" />
          </div>
        ))}
      </div>

      {/* The main panel. */}
      <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 space-y-2.5">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
