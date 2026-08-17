import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { listDatasets } from "@/lib/store";
import { ExploreView } from "@/components/explore/explore-view";

export const metadata: Metadata = { title: "Explore Data" };
export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const session = await requireSession();
  const datasets = await listDatasets(session);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Explore Data</h1>
        <p className="mt-0.5 text-[12px] text-[var(--nx-text-muted)]">
          Group a file by any column and summarise any number in it. Every
          figure is calculated from your file — you can see the query behind it.
        </p>
      </div>

      <ExploreView
        datasets={datasets.map((dataset) => ({
          id: dataset.id,
          name: dataset.name,
          rowCount: dataset.row_count ?? null,
        }))}
      />
    </div>
  );
}
