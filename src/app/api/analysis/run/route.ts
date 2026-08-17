import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertCanWrite, requireSession, SessionError } from "@/lib/auth/session";
import {
  audit,
  createJob,
  createResults,
  getDataset,
  getDatasetFile,
  saveAnomalies,
  saveForecast,
  saveRecommendations,
  saveReport,
  updateDataset,
  updateJob,
} from "@/lib/store";
import { runAnalysis, writeExecutiveSummary } from "@/lib/ai/orchestrator";
import {
  assertHasCredit,
  consumeCredit,
  OutOfCreditsError,
} from "@/lib/credits";
import type {
  ActivityStep,
  AnalysisResult,
  ReportPayload,
} from "@/lib/store/types";
import { enforceLimit } from "@/lib/security/guard";

export const maxDuration = 300;

const bodySchema = z.object({
  datasetId: z.string().uuid(),
  question: z.string().trim().min(3).max(2000),
});

/**
 * Runs an analysis and streams progress to the browser as Server-Sent Events.
 *
 * Event types:
 *   step     — one activity entry, emitted the moment it happens
 *   result   — the finished analysis payload
 *   error    — a fatal problem, with a readable message
 *
 * The stream is the product feature: the user watches the real pipeline run,
 * with real row counts and real timings, instead of a spinner.
 */
export async function POST(request: NextRequest) {
  // Abuse throttle. Returns a 429 and leaves the success path below
  // exactly as it was.
  const limited = await enforceLimit("ai");
  if (limited) return limited;

  let session;
  try {
    session = await requireSession();
    assertCanWrite(session);
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a datasetId and a question." },
      { status: 400 },
    );
  }

  const { datasetId, question } = parsed.data;

  // Checked before any work begins, so an exhausted balance is reported
  // immediately rather than after a long-running analysis.
  try {
    await assertHasCredit(session);
  } catch (error) {
    if (error instanceof OutOfCreditsError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "out_of_credits",
          balance: error.balance,
        },
        { status: 402 },
      );
    }
    throw error;
  }

  const dataset = await getDataset(session, datasetId);
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }
  const file = await getDatasetFile(session, datasetId);
  if (!file) {
    return NextResponse.json(
      { error: "The dataset file is missing. Upload it again." },
      { status: 409 },
    );
  }

  const job = await createJob(session, { datasetId, question });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // Heartbeat keeps intermediaries from closing an idle connection during
      // a long model call.
      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            closed = true;
          }
        }
      }, 15_000);

      const startedAt = Date.now();
      const steps: ActivityStep[] = [];

      try {
        send("job", { jobId: job.id, question, dataset: dataset.name });
        await updateJob(session, job.id, {
          status: "running",
          started_at: new Date().toISOString(),
        });

        const outcome = await runAnalysis({
          session,
          dataset,
          file,
          question,
          signal: request.signal,
          onStep: (step) => {
            const existing = steps.findIndex((s) => s.id === step.id);
            if (existing >= 0) steps[existing] = step;
            else steps.push(step);
            send("step", step);
          },
        });

        // --- persist verified outputs ------------------------------------
        const results: Omit<
          AnalysisResult,
          "id" | "job_id" | "organization_id" | "created_at"
        >[] = outcome.collected.tables.map((table) => ({
          kind: table.chart ? "chart" : "table",
          title: table.title,
          summary: null,
          sql_text: table.sql || null,
          row_count: table.rows.length,
          columns: table.columns,
          // Cap what is persisted so a wide result cannot bloat the row.
          rows: table.rows.slice(0, 500),
          chart: table.chart,
          numbers: {},
        }));

        // The automatic pass always contributes its charts.
        if (outcome.auto?.timeSeries) {
          results.push({
            kind: "chart",
            title: outcome.auto.timeSeries.spec.title,
            summary: outcome.auto.timeSeries.spec.reason,
            sql_text: null,
            row_count: outcome.auto.timeSeries.rows.length,
            columns: outcome.auto.timeSeries.columns,
            rows: outcome.auto.timeSeries.rows.slice(0, 500),
            chart: outcome.auto.timeSeries.spec,
            numbers: {},
          });
        }
        for (const breakdown of outcome.auto?.breakdowns ?? []) {
          results.push({
            kind: "chart",
            title: breakdown.spec.title,
            summary: breakdown.spec.reason,
            sql_text: null,
            row_count: breakdown.rows.length,
            columns: breakdown.columns,
            rows: breakdown.rows,
            chart: breakdown.spec,
            numbers: {},
          });
        }

        results.push({
          kind: "insight",
          title: "Summary",
          summary: outcome.narrative,
          sql_text: null,
          row_count: null,
          columns: null,
          rows: null,
          chart: null,
          numbers: Object.fromEntries(
            outcome.collected.figures.map((f) => [f.label, f.value]),
          ),
        });

        const savedResults = await createResults(session, job.id, results);

        const anomalies = [
          ...outcome.collected.anomalies,
          ...(outcome.auto?.anomalies ?? []),
        ].map((anomaly) => ({ ...anomaly, job_id: job.id }));
        const savedAnomalies = await saveAnomalies(session, anomalies);

        const forecastInputs = [
          ...outcome.collected.forecasts,
          ...(outcome.auto?.forecast ? [outcome.auto.forecast] : []),
        ];
        const savedForecasts = [];
        for (const forecast of forecastInputs) {
          savedForecasts.push(
            await saveForecast(session, { ...forecast, job_id: job.id }),
          );
        }

        const savedRecommendations = await saveRecommendations(
          session,
          (outcome.auto?.recommendations ?? []).map((r) => ({
            ...r,
            job_id: job.id,
          })),
        );

        // --- executive summary + report ----------------------------------
        const summaryStepId = `${job.id}-report`;
        const summaryStartedAt = Date.now();
        send("step", {
          id: summaryStepId,
          stage: "saving",
          label: "Writing the executive summary",
          detail: "assembling the PDF report from verified results",
          status: "running",
          startedAt: summaryStartedAt,
        } satisfies ActivityStep);

        const executiveSummary = await writeExecutiveSummary(
          question,
          outcome.collected.figures,
          dataset.name,
        );

        const reportPayload: ReportPayload = {
          title: `${dataset.name} — analysis`,
          question,
          datasetName: dataset.name,
          generatedAt: new Date().toISOString(),
          periodStart: outcome.auto?.periodStart ?? null,
          periodEnd: outcome.auto?.periodEnd ?? null,
          executiveSummary,
          kpis: (outcome.auto?.kpis ?? []).map((kpi) => ({
            label: kpi.label,
            value: kpi.formatted,
            change:
              kpi.changePct === null
                ? undefined
                : `${kpi.changePct > 0 ? "+" : ""}${kpi.changePct.toFixed(1)}%`,
            direction:
              kpi.direction === "flat" ? undefined : (kpi.direction as "up" | "down"),
          })),
          charts: savedResults
            .filter((r) => r.chart && r.rows)
            .map((r) => ({ spec: r.chart!, rows: r.rows! })),
          insights: [
            {
              title: "Answer",
              body: outcome.narrative,
              evidence: outcome.collected.figures.slice(0, 8),
            },
          ],
          anomalies: savedAnomalies,
          forecasts: savedForecasts,
          recommendations: savedRecommendations,
          quality: outcome.quality,
          provider: outcome.provider,
          model: outcome.model,
          steps: outcome.steps,
        };

        const report = await saveReport(session, {
          dataset_id: dataset.id,
          job_id: job.id,
          title: reportPayload.title,
          period_start: reportPayload.periodStart,
          period_end: reportPayload.periodEnd,
          payload: reportPayload,
        });

        // Close out the summary step so it does not spin forever in the UI.
        send("step", {
          id: summaryStepId,
          stage: "saving",
          label: "Report ready to download",
          detail: `${reportPayload.charts.length} chart${reportPayload.charts.length === 1 ? "" : "s"}, ${reportPayload.recommendations.length} recommendation${reportPayload.recommendations.length === 1 ? "" : "s"}`,
          status: "ok",
          startedAt: summaryStartedAt,
          durationMs: Date.now() - summaryStartedAt,
        } satisfies ActivityStep);

        const durationMs = Date.now() - startedAt;
        await updateJob(session, job.id, {
          status: "succeeded",
          provider: outcome.provider,
          model: outcome.model,
          steps: outcome.steps,
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
        });
        await updateDataset(session, dataset.id, {
          last_analyzed_at: new Date().toISOString(),
        });

        // Charged only now that the analysis has actually produced a result —
        // a failed run must never cost the user a credit.
        const balance = await consumeCredit(session, {
          jobId: job.id,
          datasetId: dataset.id,
          provider: outcome.provider,
        });

        await audit({
          organization_id: session.organizationId,
          user_id: session.userId,
          action: "analysis.completed",
          resource_type: "analysis_job",
          resource_id: job.id,
          metadata: {
            provider: outcome.provider,
            model: outcome.model,
            narrativeSource: outcome.narrativeSource,
            unverifiedClaims: outcome.unverifiedClaims.length,
            durationMs,
          },
        });

        send("result", {
          jobId: job.id,
          reportId: report.id,
          narrative: outcome.narrative,
          narrativeSource: outcome.narrativeSource,
          unverifiedClaims: outcome.unverifiedClaims,
          provider: outcome.provider,
          model: outcome.model,
          figures: outcome.collected.figures,
          results: savedResults,
          kpis: outcome.auto?.kpis ?? [],
          anomalies: savedAnomalies,
          forecasts: savedForecasts,
          recommendations: savedRecommendations,
          quality: outcome.quality,
          durationMs,
          credits: balance,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The analysis failed.";

        await updateJob(session, job.id, {
          status: "failed",
          error_message: message,
          steps,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
        }).catch(() => undefined);

        await audit({
          organization_id: session.organizationId,
          user_id: session.userId,
          action: "analysis.failed",
          resource_type: "analysis_job",
          resource_id: job.id,
          metadata: { message },
        });

        send("error", { message });
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Disable proxy buffering so events arrive as they are produced.
      "x-accel-buffering": "no",
    },
  });
}
