import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { listDatasets } from "@/lib/store";
import { hasAiProvider } from "@/lib/ai/provider";
import { AskAi } from "@/components/analysis/ask-ai";
import { Badge } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Ask AI" };
export const dynamic = "force-dynamic";

export default async function AskAiPage(props: PageProps<"/ask-ai">) {
  const session = await requireSession();
  const [datasets, params] = await Promise.all([
    listDatasets(session),
    props.searchParams,
  ]);

  const aiConfigured = hasAiProvider();
  const initialQuestion = typeof params.q === "string" ? params.q : "";
  const initialDatasetId =
    typeof params.dataset === "string" ? params.dataset : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[15px] font-semibold tracking-tight">Ask AI</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Describe the task. The engine does the rest.
        </p>
        {!aiConfigured ? (
          <Badge tone="warning" className="ml-auto">
            No AI key — statistical mode
          </Badge>
        ) : null}
      </div>

      {!aiConfigured ? (
        <p className="rounded-md border border-[var(--nx-accent-border)] bg-[var(--nx-accent-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--nx-warning-fg)]">
          No AI provider key is configured, so question understanding is
          unavailable. The full statistical pipeline still runs — profiling,
          measures, trends, anomalies, forecasting and recommendations — and the
          summary is assembled from computed values. Add{" "}
          <code className="font-mono">ANTHROPIC_API_KEY</code>,{" "}
          <code className="font-mono">GEMINI_API_KEY</code> or{" "}
          <code className="font-mono">OPENAI_API_KEY</code> to{" "}
          <code className="font-mono">.env.local</code> to enable it.
        </p>
      ) : null}

      <AskAi
        datasets={datasets}
        initialQuestion={initialQuestion}
        initialDatasetId={initialDatasetId}
      />
    </div>
  );
}
