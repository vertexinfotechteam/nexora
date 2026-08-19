import "server-only";

import { randomUUID } from "node:crypto";
import { hasAiProvider, completeWithFallback, AiError, type AiMessage } from "./provider";
import {
  ANALYST_SYSTEM_PROMPT,
  NARRATIVE_SYSTEM_PROMPT,
  renderSchema,
  sanitizeUntrusted,
} from "./prompts";
import {
  executeTool,
  TOOL_DEFINITIONS,
  type CollectedOutput,
  type ToolContext,
} from "./tools";
import { deterministicNarrative, verifyNarrative } from "./verify";
import { runAutoAnalysis, type AutoAnalysis } from "@/lib/analysis/auto";
import {
  countDuplicateRows,
  profileDataset,
  qualityFromProfiles,
} from "@/lib/ingest/profile";
import { ensureDatasetLoaded } from "@/lib/ingest/loader";
import {
  listDatasetColumns,
  listDatasetProfiles,
  replaceDatasetColumns,
  replaceDatasetProfiles,
  updateDataset,
} from "@/lib/store";
import type {
  ActivityStep,
  Dataset,
  DatasetFile,
  DatasetQuality,
  Session,
} from "@/lib/store/types";

/**
 * The analysis orchestrator.
 *
 * Pipeline, matching the architecture in the spec:
 *
 *   question -> planner -> schema -> tool selection -> DuckDB/statistics
 *            -> verified result -> narrative -> verification -> chart/insight
 *
 * Two properties are load-bearing:
 *   1. Every step is emitted as it happens, so the UI shows real progress with
 *      real numbers rather than a spinner.
 *   2. The narrative is verified against computed figures before it is shown.
 *      If it fails, a deterministic narrative replaces it and the substitution
 *      is reported in the stream — the user is never silently given a
 *      fabricated number.
 */

const MAX_TOOL_ROUNDS = 8;

export type AnalysisOutcome = {
  narrative: string;
  narrativeSource: "ai" | "verified-fallback" | "deterministic";
  provider: string | null;
  model: string | null;
  collected: CollectedOutput;
  auto: AutoAnalysis | null;
  quality: DatasetQuality | null;
  steps: ActivityStep[];
  unverifiedClaims: string[];
};

export type RunAnalysisInput = {
  session: Session;
  dataset: Dataset;
  file: DatasetFile;
  question: string;
  /** Called for every step, immediately, so the client can stream it. */
  onStep: (step: ActivityStep) => void;
  signal?: AbortSignal;
};

export async function runAnalysis(
  input: RunAnalysisInput,
): Promise<AnalysisOutcome> {
  const { session, dataset, file, question, onStep, signal } = input;
  const steps: ActivityStep[] = [];

  const emit = (
    partial: Omit<ActivityStep, "id" | "startedAt"> & { startedAt?: number },
  ): ActivityStep => {
    const step: ActivityStep = {
      id: randomUUID(),
      startedAt: partial.startedAt ?? Date.now(),
      ...partial,
    };
    steps.push(step);
    onStep(step);
    return step;
  };

  const started = Date.now();
  const collected: CollectedOutput = {
    figures: [],
    tables: [],
    anomalies: [],
    forecasts: [],
    reportRequested: false,
  };

  emit({
    stage: "understanding",
    label: "Reading your request",
    detail: sanitizeUntrusted(question, 160),
    status: "ok",
  });

  // --- 1. Load the data into the analytical engine ------------------------
  const loadStep = emit({
    stage: "schema",
    label: `Opening "${sanitizeUntrusted(dataset.name, 80)}"`,
    detail: "loading into the analysis engine",
    status: "running",
  });

  const engineKey = await ensureDatasetLoaded(dataset, file);

  loadStep.status = "ok";
  loadStep.durationMs = Date.now() - loadStep.startedAt;
  loadStep.detail = `${(dataset.row_count ?? 0).toLocaleString()} rows ready, sandbox sealed`;
  onStep(loadStep);

  // --- 2. Schema and profile ---------------------------------------------
  let columns = await listDatasetColumns(session, dataset.id);
  let profiles = await listDatasetProfiles(session, dataset.id);
  let quality: DatasetQuality | null = null;

  if (columns.length === 0 || profiles.length === 0) {
    const profileStep = emit({
      stage: "schema",
      label: "Profiling the dataset",
      detail: "measuring every column",
      status: "running",
    });

    const output = await profileDataset(engineKey, (message) => {
      profileStep.detail = message;
      onStep(profileStep);
    });

    await replaceDatasetColumns(session, dataset.id, output.columns);
    await replaceDatasetProfiles(session, dataset.id, output.profiles);
    await updateDataset(session, dataset.id, {
      row_count: output.quality.rowCount,
      column_count: output.quality.columnCount,
      quality_score: output.quality.score,
      status: "ready",
    });

    columns = await listDatasetColumns(session, dataset.id);
    profiles = await listDatasetProfiles(session, dataset.id);
    quality = output.quality;

    profileStep.status = "ok";
    profileStep.durationMs = Date.now() - profileStep.startedAt;
    profileStep.detail = `${output.quality.columnCount} columns, quality score ${output.quality.score}/100`;
    profileStep.facts = [
      { label: "Rows", value: output.quality.rowCount.toLocaleString() },
      { label: "Columns", value: String(output.quality.columnCount) },
      { label: "Duplicate rows", value: output.quality.duplicateRows.toLocaleString() },
      { label: "Quality score", value: `${output.quality.score}/100` },
    ];
    onStep(profileStep);
  } else {
    // Profiles were computed at upload; rebuild the quality summary from them
    // so the report's data-quality section is present on every run, not just
    // the first. Duplicates are recounted because they are a whole-row property.
    const duplicateRows = await countDuplicateRows(engineKey);
    quality = qualityFromProfiles(
      profiles,
      dataset.row_count ?? 0,
      duplicateRows,
    );

    emit({
      stage: "schema",
      label: `Loaded the structure: ${columns.length} columns`,
      detail: `quality score ${quality.score}/100, ${duplicateRows.toLocaleString()} duplicate rows`,
      status: "ok",
      facts: [
        { label: "Rows", value: (dataset.row_count ?? 0).toLocaleString() },
        { label: "Columns", value: String(columns.length) },
        { label: "Duplicate rows", value: duplicateRows.toLocaleString() },
        { label: "Quality score", value: `${quality.score}/100` },
      ],
    });
  }

  const rowCount = dataset.row_count ?? 0;

  // --- 3. Automatic analysis ---------------------------------------------
  // Runs regardless of the question so the report is always complete.
  const autoStep = emit({
    stage: "computing",
    label: "Running the automatic analysis",
    detail: "measures, trend, breakdowns, anomalies, forecast",
    status: "running",
  });

  let auto: AutoAnalysis | null = null;
  try {
    auto = await runAutoAnalysis(
      engineKey,
      dataset.id,
      columns,
      profiles,
      quality,
      (message, detail) => {
        autoStep.detail = detail ? `${message} — ${detail}` : message;
        onStep(autoStep);
      },
    );
    autoStep.status = "ok";
    autoStep.durationMs = Date.now() - autoStep.startedAt;
    autoStep.detail = [
      auto.kpis.length ? `${auto.kpis.length} measures` : null,
      auto.anomalies.length ? `${auto.anomalies.length} anomalies` : null,
      auto.forecast ? "forecast fitted" : null,
      auto.recommendations.length ? `${auto.recommendations.length} recommendations` : null,
    ]
      .filter(Boolean)
      .join(", ");
    autoStep.facts = auto.kpis.slice(0, 4).map((kpi) => ({
      label: kpi.label,
      value: kpi.formatted,
    }));
  } catch (error) {
    autoStep.status = "error";
    autoStep.detail = safeStepDetail(error, "automatic analysis");
  }
  onStep(autoStep);

  // Figures from the automatic pass are verified computations too.
  if (auto) collected.figures.push(...auto.figures);

  // --- 4. AI planning loop ------------------------------------------------
  let narrative = "";
  let narrativeSource: AnalysisOutcome["narrativeSource"] = "deterministic";
  let providerId: string | null = null;
  let modelId: string | null = null;
  const unverifiedClaims: string[] = [];

  const ctx: ToolContext = {
    engineKey,
    datasetId: dataset.id,
    datasetName: dataset.name,
    rowCount,
    columns,
    profiles,
    collected,
    emit: (event) =>
      emit({
        stage: event.stage,
        label: event.label,
        detail: event.detail,
        status: event.status,
        facts: event.facts,
        sql: event.sql,
        durationMs: event.durationMs,
      }),
  };

  if (!hasAiProvider()) {
    emit({
      stage: "planning",
      label: "Running without an AI provider",
      detail:
        "No API key is configured, so the analysis is fully statistical and the summary is built from computed figures only.",
      status: "warn",
    });
    narrative = deterministicNarrative(question, collected.figures, rowCount);
    narrativeSource = "deterministic";
  } else {
    const planStep = emit({
      stage: "planning",
      label: "Planning the analysis",
      detail: "choosing which calculations answer your question",
      status: "running",
    });

    const profileByName = new Map(profiles.map((p) => [p.column_name, p]));
    const schemaBlock = renderSchema(
      dataset.name,
      rowCount,
      columns.map((column) => {
        const profile = profileByName.get(column.name);
        return {
          name: column.name,
          data_type: column.data_type,
          semantic_type: column.semantic_type,
          nullCount: profile?.null_count,
          distinctCount: profile?.distinct_count ?? null,
          sample: profile?.top_values?.map((t) => t.value) ?? [],
        };
      }),
    );

    const messages: AiMessage[] = [
      {
        role: "user",
        text: `${schemaBlock}

The user asks:
${sanitizeUntrusted(question, 1000)}

Answer it using the tools. Compute every figure you cite.`,
      },
    ];

    try {
      let rounds = 0;
      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++;
        if (signal?.aborted) throw new Error("Analysis cancelled.");

        const { response, provider } = await completeWithFallback({
          system: ANALYST_SYSTEM_PROMPT,
          messages,
          tools: TOOL_DEFINITIONS,
          maxTokens: 2048,
          signal,
        });

        providerId = provider.id;
        modelId = provider.model;

        if (rounds === 1) {
          planStep.status = "ok";
          planStep.durationMs = Date.now() - planStep.startedAt;
          planStep.detail = `${provider.id} · ${provider.model}`;
          onStep(planStep);
        }

        if (response.toolCalls.length === 0) {
          narrative = response.text.trim();
          break;
        }

        messages.push({
          role: "assistant",
          text: response.text || undefined,
          toolCalls: response.toolCalls,
        });

        for (const call of response.toolCalls) {
          const result = await executeTool(call.name, call.input, ctx);
          messages.push({
            role: "tool",
            callId: call.id,
            name: call.name,
            result: result.display.slice(0, 12_000),
          });
        }
      }

      if (!narrative) {
        emit({
          stage: "explaining",
          label: "Summarising from the computed figures",
          detail: `The planner used all ${MAX_TOOL_ROUNDS} tool rounds without writing a summary.`,
          status: "warn",
        });
      }
    } catch (error) {
      emit({
        stage: "planning",
        label: "The AI planner could not complete",
        detail: safeStepDetail(error, "planner"),
        status: "error",
      });
    }

    // --- 5. Verify the narrative -----------------------------------------
    if (narrative) {
      const verifyStep = emit({
        stage: "explaining",
        label: "Checking every figure in the summary",
        detail: `${collected.figures.length} computed values to check against`,
        status: "running",
      });

      const verification = verifyNarrative(
        narrative,
        collected.figures,
        collected.tables.map((t) => t.rows),
        question,
      );

      if (verification.ok) {
        narrativeSource = "ai";
        verifyStep.status = "ok";
        verifyStep.durationMs = Date.now() - verifyStep.startedAt;
        verifyStep.detail = `All ${verification.claims.length} figures trace back to a computation`;
      } else {
        unverifiedClaims.push(...verification.unverified.map((c) => c.raw));
        narrative = deterministicNarrative(question, collected.figures, rowCount);
        narrativeSource = "verified-fallback";
        verifyStep.status = "error";
        verifyStep.durationMs = Date.now() - verifyStep.startedAt;
        verifyStep.detail = `Rejected ${verification.unverified.length} figure(s) that did not come from a computation (${verification.unverified.map((c) => c.raw).join(", ")}). The summary was rebuilt from verified values only.`;
      }
      onStep(verifyStep);
    } else {
      narrative = deterministicNarrative(question, collected.figures, rowCount);
      narrativeSource = "deterministic";
    }
  }

  emit({
    stage: "done",
    label: "Computation complete",
    detail: `${collected.tables.length} result set${collected.tables.length === 1 ? "" : "s"}, ${collected.figures.length} verified figures in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    status: "ok",
    durationMs: Date.now() - started,
  });

  return {
    narrative,
    narrativeSource,
    provider: providerId,
    model: modelId,
    collected,
    auto,
    quality,
    steps,
    unverifiedClaims,
  };
}

/**
 * Turns a failure into a line that belongs in front of a customer.
 *
 * The step detail written here is shown in the live activity stream and
 * printed into the method trail of the downloadable PDF. A provider's raw
 * error body was going straight into both — so a customer's report carried
 * the vendor's JSON, our quota position, the tier we are on and the support
 * URLs to go with it. None of that is theirs to receive, and none of it tells
 * them anything they can act on.
 *
 * The full text still reaches the server log, where the person who can act on
 * it will look.
 */
export function safeStepDetail(error: unknown, context: string): string {
  console.error(`[analysis] ${context}:`, error);

  if (error instanceof AiError) {
    if (error.status === 429) {
      return "The AI service is busy right now and refused further requests. The figures below were still computed by the engine.";
    }
    if (error.status === 401 || error.status === 403) {
      return "The AI service refused our credentials, so the written summary was skipped.";
    }
    if (error.status && error.status >= 500) {
      return "The AI service was unavailable, so the written summary was skipped.";
    }
    if (/timed out/i.test(error.message)) {
      return "The AI service did not respond in time, so the written summary was skipped.";
    }
    return "The AI service could not complete this step. The figures below were still computed by the engine.";
  }

  return "This step could not be completed. Nothing was estimated to cover the gap.";
}

/**
 * Writes the executive summary for the PDF report from verified figures only.
 * Falls back to a deterministic summary when no provider is configured or when
 * the model's prose fails verification.
 */
export async function writeExecutiveSummary(
  question: string,
  figures: { label: string; value: string }[],
  datasetName: string,
): Promise<string> {
  /**
   * Deliberately structured differently from the answer narrative: the summary
   * states scope and headline figures, the answer states the finding. Reusing
   * one text for both reads as padding in the report.
   */
  const fallback = () => {
    const name = sanitizeUntrusted(datasetName, 80);
    if (figures.length === 0) {
      /*
       * "No headline measure", not "no figures".
       *
       * This branch is reached when no KPI was singled out, which is not the
       * same as the analysis finding nothing — the report it opens routinely
       * goes on to state several computed figures, a chart and a full method
       * trail. Saying the analysis "produced no summary figures" above a page
       * of them made the document contradict itself on its own first screen.
       */
      return `This report covers "${name}" and answers: "${sanitizeUntrusted(question, 200).replace(/\?+$/, "")}". No single headline measure was singled out for this question, so the finding is stated in full below, along with the charts, the checks and the method behind it. Every figure in this report was computed by the analytics engine directly from the dataset.`;
    }
    const headline = figures
      .slice(0, 4)
      .map((figure) => `${figure.label} — ${figure.value}`)
      .join("; ");
    return `This report covers "${name}" and was produced in response to: "${sanitizeUntrusted(question, 200).replace(/\?+$/, "")}". The headline figures are: ${headline}. Every number in this report was computed by the analytics engine directly from the dataset; the sections that follow give the charts, anomalies, forecast and recommendations behind them.`;
  };

  if (!hasAiProvider() || figures.length === 0) return fallback();

  try {
    const { response } = await completeWithFallback({
      system: NARRATIVE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          text: `Question: ${sanitizeUntrusted(question, 500)}

VERIFIED FIGURES:
${figures.map((f) => `- ${f.label}: ${f.value}`).join("\n")}

Write the executive summary.`,
        },
      ],
      maxTokens: 500,
    });

    const text = response.text.trim();
    if (!text) return fallback();

    const verification = verifyNarrative(text, figures, [], question);
    return verification.ok ? text : fallback();
  } catch {
    return fallback();
  }
}
