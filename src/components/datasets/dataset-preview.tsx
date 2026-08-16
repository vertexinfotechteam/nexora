"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResultTable } from "@/components/charts/chart-view";

const PAGE_SIZE = 25;

/**
 * Paginated preview. Deliberately fetches one page at a time — the spec forbids
 * loading a whole dataset into the browser, and a 27k-row table would freeze it.
 */
export function DatasetPreview({ datasetId }: { datasetId: string }) {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<{
    columns: { name: string; type: string }[];
    rows: Record<string, unknown>[];
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/datasets/${datasetId}/preview?offset=${nextOffset}&limit=${PAGE_SIZE}`,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Preview failed.");
        setState({ columns: data.columns, rows: data.rows, total: data.total });
      } catch (caught) {
        setError((caught as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [datasetId],
  );

  useEffect(() => {
    load(offset);
  }, [load, offset]);

  if (error) {
    return (
      <p className="px-4 py-6 text-center text-[12px] text-[var(--nx-error)]">
        {error}
      </p>
    );
  }

  if (!state) {
    return (
      <p className="flex items-center justify-center gap-2 px-4 py-8 text-[12px] text-[var(--nx-text-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading preview…
      </p>
    );
  }

  const from = state.total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, state.total);

  return (
    <div>
      <div className="max-h-[420px] overflow-auto">
        <ResultTable
          columns={state.columns.map((c) => c.name)}
          rows={state.rows}
          maxRows={PAGE_SIZE}
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--nx-border)] px-3 py-1.5">
        <span className="text-[11px] text-[var(--nx-text-muted)]">
          Rows {from.toLocaleString()}–{to.toLocaleString()} of{" "}
          {state.total.toLocaleString()}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={to >= state.total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            aria-label="Next page"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
