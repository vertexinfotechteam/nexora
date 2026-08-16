import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { listDatasets } from "@/lib/store";
import { DatasetManager } from "@/components/datasets/dataset-manager";

export const metadata: Metadata = { title: "Sources" };
export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const session = await requireSession();
  const datasets = await listDatasets(session);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Sources</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Upload data, then ask a question about it.
        </p>
      </div>
      <DatasetManager datasets={datasets} />
    </div>
  );
}
