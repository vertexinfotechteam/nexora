import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listDashboards } from "@/lib/store";
import { Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";
import { CreateView } from "@/components/dashboards/create-view";
import { DeleteView } from "@/components/dashboards/delete-view";

export const metadata: Metadata = { title: "Saved Views" };

/**
 * Saved views: named screens holding tiles the user pinned.
 *
 * Each tile stores the question rather than the answer — which file, which
 * grouping, which summary — and is recomputed when the view is opened. A saved
 * screen therefore cannot show a figure that was true when it was pinned and
 * is no longer true, which is the failure that makes saved dashboards
 * untrustworthy elsewhere.
 */
export default async function DashboardsPage() {
  const session = await requireSession();
  const views = await listDashboards(session);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight">Saved Views</h1>
          <p className="text-[12px] text-[var(--nx-text-muted)]">
            Pin the summaries you check often onto one screen. Every tile is
            recalculated from your file each time you open it.
          </p>
        </div>
        <div className="ml-auto">
          <CreateView />
        </div>
      </div>

      {views.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard className="h-4 w-4" />}
          title="No saved views yet"
          description="Create a view, then add tiles to it — a total by region, a count by month, whichever summaries you keep coming back to."
          className="py-16"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {views.map((view) => (
            <Card key={view.id}>
              <CardBody className="flex items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboards/${view.id}`}
                    className="block truncate text-[13px] font-semibold hover:underline"
                  >
                    {view.name}
                  </Link>
                  <p className="mt-1 text-[11px] text-[var(--nx-text-muted)]">
                    Updated {relativeTime(view.updated_at)}
                  </p>
                </div>
                <DeleteView id={view.id} name={view.name} />
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
