import {
  Document,
  Image,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  Circle,
  Line as SvgLine,
  renderToBuffer,
} from "@react-pdf/renderer";
import { buildChartGeometry, PDF_SERIES_COLORS } from "./chart-svg";
import { accuracyLabel } from "@/lib/analysis/forecast";
import { formatNumber } from "@/lib/utils";
import type { ReportPayload } from "@/lib/store/types";
import type { Branding } from "@/lib/branding";

/**
 * PDF report generation.
 *
 * Charts are drawn as real vectors from the same rows the UI charted, so the
 * document is crisp at any zoom and every number in it is one the engine
 * computed. Sections that have no data say so rather than being omitted
 * silently — a missing forecast is information.
 */

/**
 * The built-in PDF fonts are limited to WinAnsi. Characters outside it — Greek
 * letters from model parameters, arrows, typographic dashes — render as
 * unrelated glyphs rather than failing loudly, so every dynamic string is
 * mapped to a WinAnsi-safe equivalent before it reaches the document.
 */
const GLYPH_MAP: [RegExp, string][] = [
  [/α/g, "alpha"],
  [/β/g, "beta"],
  [/γ/g, "gamma"],
  [/σ/g, "sigma"],
  [/μ/g, "mu"],
  [/[←-⇿▲▼▴▾]/g, ""],
  [/[—–]/g, "-"],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, "..."],
  [/−/g, "-"],
  [/×/g, "x"],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/≈/g, "~"],
];

/** Makes a string safe for the built-in PDF fonts. */
function t(value: string): string {
  let text = value;
  for (const [pattern, replacement] of GLYPH_MAP) {
    text = text.replace(pattern, replacement);
  }
  // Anything still outside WinAnsi renders as an unrelated glyph, so drop it.
  return text.replace(/[^ -ÿ]/g, "").replace(/ {2,}/g, " ");
}

/**
 * Applies t() to every string in the payload, once, before rendering.
 * Doing it centrally means a field added to the report later cannot silently
 * reintroduce unrenderable characters.
 */
function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return t(value) as unknown as T;
  if (Array.isArray(value)) return value.map(sanitizeDeep) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeDeep(item);
    }
    return out as T;
  }
  return value;
}

const C = {
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  panel: "#f8fafc",
  accent: "#0a4a3c",
  good: "#16a34a",
  bad: "#dc2626",
  warn: "#b45309",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 46,
    paddingHorizontal: 44,
    fontSize: 9,
    color: C.body,
    fontFamily: "Helvetica",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
    paddingBottom: 7,
    marginBottom: 14,
  },
  logo: { width: 92, height: 30, objectFit: "contain", marginRight: 10 },
  signature: { width: 118, height: 40, objectFit: "contain", marginBottom: 2 },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.6 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 4 },
  subtitle: { fontSize: 9, color: C.muted, marginBottom: 3 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  paragraph: { fontSize: 9.5, lineHeight: 1.55, color: C.body, marginBottom: 6 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  kpiCard: {
    width: "33.33%",
    paddingHorizontal: 3,
    marginBottom: 6,
  },
  kpiInner: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 4,
    padding: 7,
    backgroundColor: C.panel,
  },
  kpiLabel: { fontSize: 7.5, color: C.muted, marginBottom: 2 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink },
  kpiChange: { fontSize: 7.5, marginTop: 2 },
  card: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 4 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.ink,
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 2.5,
  },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.ink },
  td: { fontSize: 8, color: C.body },
  evidenceChip: {
    fontSize: 7.5,
    color: C.body,
    backgroundColor: C.panel,
    borderWidth: 0.5,
    borderColor: C.line,
    borderRadius: 2,
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    marginRight: 3,
    marginBottom: 3,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 5,
    fontSize: 7,
    color: C.muted,
  },
  note: {
    fontSize: 7.5,
    color: C.muted,
    marginTop: 3,
    lineHeight: 1.4,
  },
});

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>NEXORA AI · every figure computed from the source dataset</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${new Date(generatedAt).toUTCString()}   ·   Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

function ChartBlock({
  spec,
  rows,
}: {
  spec: ReportPayload["charts"][number]["spec"];
  rows: Record<string, unknown>[];
}) {
  const geometry = buildChartGeometry(spec, rows);

  if (geometry.kind === "none") {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{spec.title}</Text>
        <Text style={styles.note}>{geometry.reason}</Text>
      </View>
    );
  }

  if (geometry.kind === "pie") {
    return (
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>{spec.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Svg width={geometry.height + 20} height={geometry.height}>
            <View />
            {geometry.slices.map((slice, index) => (
              <Path
                key={index}
                d={slice.path}
                fill={slice.color}
                transform={`translate(${(geometry.height + 20) / 2}, ${geometry.height / 2})`}
              />
            ))}
          </Svg>
          <View style={{ flex: 1, paddingLeft: 10 }}>
            {geometry.slices.slice(0, 8).map((slice, index) => (
              <View
                key={index}
                style={{ flexDirection: "row", alignItems: "center", marginBottom: 2.5 }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: slice.color,
                    marginRight: 4,
                  }}
                />
                <Text style={{ fontSize: 7.5, flex: 1, color: C.body }}>
                  {slice.label.length > 26 ? `${slice.label.slice(0, 25)}…` : slice.label}
                </Text>
                <Text style={{ fontSize: 7.5, color: C.ink }}>
                  {formatNumber(slice.value)} ({slice.percent.toFixed(1)}%)
                </Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={styles.note}>{spec.reason}</Text>
      </View>
    );
  }

  const { plot } = geometry;

  return (
    <View style={styles.card} wrap={false}>
      <Text style={styles.cardTitle}>{spec.title}</Text>
      <Svg width={geometry.width} height={geometry.height}>
        {/* horizontal grid + y labels */}
        {geometry.yTicks.map((tick, index) => (
          <SvgLine
            key={`g${index}`}
            x1={plot.left}
            y1={tick.y}
            x2={plot.right}
            y2={tick.y}
            strokeWidth={0.5}
            stroke={C.line}
          />
        ))}
        {geometry.yTicks.map((tick, index) => (
          <Text
            key={`yl${index}`}
            x={plot.left - 5}
            y={tick.y + 2.5}
            style={{ fontSize: 6.5, fill: C.muted, textAnchor: "end" }}
          >
            {tick.label}
          </Text>
        ))}

        {/* axes */}
        <SvgLine
          x1={plot.left}
          y1={plot.bottom}
          x2={plot.right}
          y2={plot.bottom}
          strokeWidth={0.8}
          stroke={C.muted}
        />

        {/* bars */}
        {geometry.bars.map((bar, index) => (
          <Rect
            key={`b${index}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={bar.color}
          />
        ))}

        {/* lines */}
        {geometry.series.map((series, index) => (
          <Path
            key={`s${index}`}
            d={series.path}
            stroke={series.color}
            strokeWidth={1.4}
            fill="none"
          />
        ))}

        {/* scatter */}
        {geometry.points.map((point, index) => (
          <Circle
            key={`p${index}`}
            cx={point.cx}
            cy={point.cy}
            r={1.8}
            fill={point.color}
            fillOpacity={0.7}
          />
        ))}

        {/* x labels */}
        {geometry.xTicks.map((tick, index) => (
          <Text
            key={`xl${index}`}
            x={tick.x}
            y={plot.bottom + 10}
            style={{ fontSize: 6.5, fill: C.muted, textAnchor: "middle" }}
          >
            {tick.label}
          </Text>
        ))}
      </Svg>

      {geometry.series.length > 1 ? (
        <View style={{ flexDirection: "row", marginTop: 3 }}>
          {geometry.series.map((series, index) => (
            <View
              key={index}
              style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}
            >
              <View
                style={{
                  width: 6,
                  height: 2,
                  backgroundColor: series.color,
                  marginRight: 3,
                }}
              />
              <Text style={{ fontSize: 7, color: C.muted }}>{series.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.note}>{spec.reason}</Text>
    </View>
  );
}

function ReportDocument({
  payload,
  branding,
  workspaceName,
}: {
  payload: ReportPayload;
  branding: Branding;
  workspaceName: string;
}) {
  const businessName = branding.business_name || workspaceName;
  const period =
    payload.periodStart && payload.periodEnd
      ? `${payload.periodStart} to ${payload.periodEnd}`
      : "Full dataset";

  return (
    <Document
      title={payload.title}
      author="NEXORA AI"
      subject={payload.question}
      creator="NEXORA AI"
    >
      {/* ------------------------------------------------------------ p1 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {branding.logo_data_url ? (
              /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image takes no alt */
              <Image src={branding.logo_data_url} style={styles.logo} />
            ) : null}
            <View>
              <Text style={styles.brand}>{businessName}</Text>
              <Text style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>
                Analysis report - generated by NEXORA AI
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 8, color: C.muted }}>Analysis report</Text>
        </View>

        <Text style={styles.title}>{payload.title}</Text>
        <Text style={styles.subtitle}>Question: {payload.question}</Text>
        <Text style={styles.subtitle}>
          Dataset: {payload.datasetName}   ·   Data period: {period}
        </Text>
        <Text style={styles.subtitle}>
          Generated: {new Date(payload.generatedAt).toUTCString()}
          {payload.provider ? `   ·   Narrative: ${payload.provider}/${payload.model}` : ""}
        </Text>

        <Text style={styles.sectionTitle}>Executive summary</Text>
        <Text style={styles.paragraph}>{payload.executiveSummary}</Text>

        {payload.insights.map((insight, index) => (
          <View key={index}>
            <Text style={[styles.paragraph, { fontFamily: "Helvetica-Bold" }]}>
              {insight.title}
            </Text>
            {/* Without an AI provider the summary and the answer are the same
                deterministic text; printing it twice reads as padding. */}
            {insight.body.trim() === payload.executiveSummary.trim() ? null : (
              <Text style={styles.paragraph}>{insight.body}</Text>
            )}
            {insight.evidence.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 4 }}>
                {insight.evidence.map((item, evidenceIndex) => (
                  <Text key={evidenceIndex} style={styles.evidenceChip}>
                    {item.label}: {item.value}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        {payload.kpis.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Key measures</Text>
            <View style={styles.kpiRow}>
              {payload.kpis.map((kpi, index) => (
                <View key={index} style={styles.kpiCard}>
                  <View style={styles.kpiInner}>
                    <Text style={styles.kpiLabel}>{kpi.label}</Text>
                    <Text style={styles.kpiValue}>{kpi.value}</Text>
                    {kpi.change ? (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        {/* Drawn rather than typed: the built-in fonts have no
                            triangle glyph, and a missing one renders as noise. */}
                        <Svg width={5} height={5} style={{ marginRight: 2.5 }}>
                          <Path
                            d={kpi.direction === "up" ? "M2.5 0 L5 5 L0 5 Z" : "M0 0 L5 0 L2.5 5 Z"}
                            fill={kpi.direction === "up" ? C.good : C.bad}
                          />
                        </Svg>
                        <Text
                          style={[
                            styles.kpiChange,
                            { marginTop: 0, color: kpi.direction === "up" ? C.good : C.bad },
                          ]}
                        >
                          {kpi.change} vs previous period
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.kpiChange, { color: C.muted }]}>
                        No previous period
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {payload.quality ? (
          <>
            <Text style={styles.sectionTitle}>Data quality</Text>
            <Text style={styles.paragraph}>
              Score {payload.quality.score} / 100 across{" "}
              {payload.quality.rowCount.toLocaleString()} rows and{" "}
              {payload.quality.columnCount} columns.{" "}
              {payload.quality.duplicateRows.toLocaleString()} duplicate rows,{" "}
              {payload.quality.missingCells.toLocaleString()} missing cells of{" "}
              {payload.quality.totalCells.toLocaleString()}.
            </Text>
            {payload.quality.issues.slice(0, 5).map((issue, index) => (
              <Text key={index} style={styles.note}>
                • {issue.column}: {issue.detail}
              </Text>
            ))}
          </>
        ) : null}

        <Footer generatedAt={payload.generatedAt} />
      </Page>

      {/* ------------------------------------------------------------ p2 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>NEXORA AI</Text>
          <Text style={{ fontSize: 8, color: C.muted }}>Charts</Text>
        </View>

        <Text style={styles.sectionTitle}>Charts</Text>
        {payload.charts.length === 0 ? (
          <Text style={styles.paragraph}>
            No chartable result was produced for this question.
          </Text>
        ) : (
          payload.charts
            .slice(0, 6)
            .map((chart, index) => (
              <ChartBlock key={index} spec={chart.spec} rows={chart.rows} />
            ))
        )}

        <Footer generatedAt={payload.generatedAt} />
      </Page>

      {/* ------------------------------------------------------------ p3 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>NEXORA AI</Text>
          <Text style={{ fontSize: 8, color: C.muted }}>
            Anomalies · Forecast · Recommendations
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Anomalies</Text>
        {payload.anomalies.length === 0 ? (
          <Text style={styles.paragraph}>
            No values deviated far enough from the local level to be flagged.
          </Text>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: "15%" }]}>Date</Text>
              <Text style={[styles.th, { width: "17%" }]}>Metric</Text>
              <Text style={[styles.th, { width: "14%", textAlign: "right" }]}>Actual</Text>
              <Text style={[styles.th, { width: "14%", textAlign: "right" }]}>Expected</Text>
              <Text style={[styles.th, { width: "14%", textAlign: "right" }]}>Deviation</Text>
              <Text style={[styles.th, { width: "15%", textAlign: "center" }]}>Severity</Text>
              <Text style={[styles.th, { width: "11%", textAlign: "right" }]}>Conf.</Text>
            </View>
            {payload.anomalies.slice(0, 18).map((anomaly, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.td, { width: "15%" }]}>{anomaly.occurred_on}</Text>
                <Text style={[styles.td, { width: "17%" }]}>{anomaly.metric}</Text>
                <Text style={[styles.td, { width: "14%", textAlign: "right" }]}>
                  {formatNumber(anomaly.actual_value)}
                </Text>
                <Text style={[styles.td, { width: "14%", textAlign: "right" }]}>
                  {formatNumber(anomaly.expected_value)}
                </Text>
                <Text
                  style={[
                    styles.td,
                    {
                      width: "14%",
                      textAlign: "right",
                      color: anomaly.direction === "spike" ? C.good : C.bad,
                    },
                  ]}
                >
                  {anomaly.deviation_pct === null
                    ? "-"
                    : `${anomaly.deviation_pct > 0 ? "+" : ""}${anomaly.deviation_pct.toFixed(1)}%`}
                </Text>
                <Text style={[styles.td, { width: "15%", textAlign: "center" }]}>
                  {anomaly.severity} {anomaly.direction === "spike" ? "up" : "down"}
                </Text>
                <Text style={[styles.td, { width: "11%", textAlign: "right" }]}>
                  {anomaly.confidence}%
                </Text>
              </View>
            ))}
            <Text style={styles.note}>
              Method: {payload.anomalies[0].method}. Expected values are the local
              level from surrounding periods, not a global average.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Forecast</Text>
        {payload.forecasts.length === 0 ? (
          <Text style={styles.paragraph}>
            No forecast was produced — the series did not have enough history.
          </Text>
        ) : (
          payload.forecasts.map((forecast, index) => (
            <View key={index} style={styles.card} wrap={false}>
              <Text style={styles.cardTitle}>
                {forecast.metric} — next {forecast.horizon} {forecast.granularity}
                {forecast.horizon === 1 ? "" : "s"}
              </Text>
              <Text style={styles.note}>
                Model: {forecast.model}
                {forecast.mape !== null
                  ? `   ·   ${accuracyLabel(forecast.accuracy_basis)}: ${forecast.mape}%`
                  : ""}
                   ·   History: {forecast.history.length} periods
              </Text>
              <View style={[styles.tableHeader, { marginTop: 5 }]}>
                <Text style={[styles.th, { width: "34%" }]}>Period</Text>
                <Text style={[styles.th, { width: "22%", textAlign: "right" }]}>
                  Projected
                </Text>
                <Text style={[styles.th, { width: "22%", textAlign: "right" }]}>Low</Text>
                <Text style={[styles.th, { width: "22%", textAlign: "right" }]}>High</Text>
              </View>
              {forecast.points.map((point, pointIndex) => (
                <View key={pointIndex} style={styles.tableRow}>
                  <Text style={[styles.td, { width: "34%" }]}>{point.period}</Text>
                  <Text style={[styles.td, { width: "22%", textAlign: "right" }]}>
                    {formatNumber(point.value)}
                  </Text>
                  <Text
                    style={[styles.td, { width: "22%", textAlign: "right", color: C.muted }]}
                  >
                    {formatNumber(point.lower)}
                  </Text>
                  <Text
                    style={[styles.td, { width: "22%", textAlign: "right", color: C.muted }]}
                  >
                    {formatNumber(point.upper)}
                  </Text>
                </View>
              ))}
              {forecast.data_quality_note ? (
                <Text style={[styles.note, { color: C.warn }]}>
                  Data quality: {forecast.data_quality_note}
                </Text>
              ) : null}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Recommendations</Text>
        {payload.recommendations.length === 0 ? (
          <Text style={styles.paragraph}>
            No recommendation met the evidence threshold for this dataset.
          </Text>
        ) : (
          payload.recommendations.map((recommendation, index) => (
            <View key={index} style={styles.card} wrap={false}>
              <Text style={styles.cardTitle}>
                {recommendation.title}
                {recommendation.impact ? `  ·  ${recommendation.impact} impact` : ""}
              </Text>
              <Text style={styles.paragraph}>{recommendation.body}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {recommendation.evidence.map((item, evidenceIndex) => (
                  <Text key={evidenceIndex} style={styles.evidenceChip}>
                    {item.label}: {item.value}
                  </Text>
                ))}
              </View>
            </View>
          ))
        )}

        <Footer generatedAt={payload.generatedAt} />
      </Page>

      {/* ------------------------------------------------------------ p4 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>NEXORA AI</Text>
          <Text style={{ fontSize: 8, color: C.muted }}>Method</Text>
        </View>

        <Text style={styles.sectionTitle}>How this analysis was produced</Text>
        <Text style={styles.paragraph}>
          Each step below ran against your dataset inside a sealed analytical
          engine with no network or filesystem access. Figures were computed by
          the engine; the written summary was checked against those figures
          before publication and rejected if it contained anything else.
        </Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, { width: "14%" }]}>Stage</Text>
          <Text style={[styles.th, { width: "48%" }]}>Step</Text>
          <Text style={[styles.th, { width: "28%" }]}>Detail</Text>
          <Text style={[styles.th, { width: "10%", textAlign: "right" }]}>Time</Text>
        </View>
        {payload.steps.map((step, index) => (
          <View key={index} style={styles.tableRow}>
            <Text style={[styles.td, { width: "14%", color: C.muted }]}>
              {step.stage}
            </Text>
            <Text style={[styles.td, { width: "48%" }]}>{step.label}</Text>
            <Text style={[styles.td, { width: "28%", color: C.muted }]}>
              {step.detail ?? ""}
            </Text>
            <Text style={[styles.td, { width: "10%", textAlign: "right" }]}>
              {step.durationMs ? `${step.durationMs}ms` : ""}
            </Text>
          </View>
        ))}

        {/* Authorised signature. Only rendered when the workspace has supplied
            one — an empty signature line on a report is worse than none. */}
        {branding.signature_data_url || branding.signatory_name ? (
          <View style={{ marginTop: 26 }} wrap={false}>
            <Text style={styles.sectionTitle}>Authorised by</Text>
            {branding.signature_data_url ? (
              /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */
              <Image src={branding.signature_data_url} style={styles.signature} />
            ) : null}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: C.ink,
                width: 190,
                paddingTop: 3,
              }}
            >
              <Text
                style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink }}
              >
                {branding.signatory_name || "Authorised signatory"}
              </Text>
              {branding.signatory_title ? (
                <Text style={{ fontSize: 8, color: C.muted, marginTop: 1 }}>
                  {branding.signatory_title}
                </Text>
              ) : null}
              <Text style={{ fontSize: 8, color: C.muted, marginTop: 1 }}>
                {businessName}
              </Text>
            </View>
          </View>
        ) : null}

        <Footer generatedAt={payload.generatedAt} />
      </Page>
    </Document>
  );
}

export async function renderReportPdf(
  payload: ReportPayload,
  branding: Branding,
  workspaceName: string,
): Promise<Buffer> {
  return renderToBuffer(
    <ReportDocument
      payload={sanitizeDeep(payload)}
      // Image data URLs must not go through the text sanitiser.
      branding={{ ...sanitizeDeep({ ...branding, logo_data_url: null, signature_data_url: null }), logo_data_url: branding.logo_data_url, signature_data_url: branding.signature_data_url }}
      workspaceName={t(workspaceName)}
    />,
  );
}
