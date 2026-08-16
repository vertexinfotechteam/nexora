# Nexus

**Powered by Vertex Infotech**

An AI-powered data analytics SaaS. Upload a dataset, describe a task in plain
language, and watch the analysis run step by step — then download the result as
a PDF or Excel report carrying your business logo and signature.

The product rule that shapes the whole codebase: **every number shown to a user
is computed by the analytics engine.** The AI plans, selects tools and explains.
It never calculates, and anything it writes that cannot be traced back to a
computation is rejected before it reaches the screen.

## The team

| Name | Role |
|---|---|
| Tarang Vasoya | Project Lead & CEO |
| Het Aghera | AI & Backend |
| Om Bardoliya | Frontend & UI/UX |
| Dharm Senjaliya | Product & Database |
| Navneet Radadiya | QA & Product |

## What is included

- **Marketing site** at `/` — hero with a live demo chart and an opinion poll,
  product, pricing, resources, team and a 24/7 assistant. The demo figures are
  generated in the browser and labelled as samples; nothing there is connected
  to a real system.
- **The product** at `/dashboard` — upload, profile, ask, watch, export.
- **Light and dark themes.** Light is the default; the switch is in the
  navigation bar and the in-app top bar, and the choice survives a reload.
- **10 free AI analysis credits** per account, enforced on the server. A failed
  analysis never costs a credit, and exports are always free.
- **Admin panel** at `/admin` for workspace owners and admins — live activity
  feed, active users, throughput, credit consumption and system health, all
  derived from records the platform actually wrote.

---

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000> and choose **Continue in local mode**.

Local mode needs no accounts and no keys: datasets are stored under `.nexora/`
on your machine and the full statistical pipeline runs. Connect Supabase and an
AI key when you want multi-user auth and natural-language question
understanding.

Generate a realistic dataset to try it with:

```bash
node scripts/make-sample-data.mjs sample-sales.csv 730
```

That writes 27,000 rows of sales data with deliberate imperfections — missing
values, 40 duplicate rows, a constant column, seasonal peaks — so the profiler,
quality score and anomaly detection have something real to find.

---

## Connecting Supabase

1. Create a project at <https://supabase.com/dashboard>. Choose a region near
   you and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/migrations/0001_nexora_init.sql`](supabase/migrations/0001_nexora_init.sql)
   and run it. It creates all tables, indexes, constraints, RLS policies, the
   username-login helper functions and the private `datasets` storage bucket.
3. Open **Project Settings → API** and copy into `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   ```

4. Under **Authentication → URL Configuration**, set the Site URL to
   `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the
   redirect allow-list.
5. Restart `npm run dev`. The sign-in page switches from local mode to real
   accounts automatically — no code changes.

The `service_role` key bypasses RLS. It is read only on the server (enforced by
the `server-only` import in `src/lib/env.ts`) and is used for exactly three
things: resolving a username to an email at sign-in, writing audit records, and
reading dataset files for the analysis engine.

---

## Connecting an AI provider

Set any one of these in `.env.local` and restart:

```bash
ANTHROPIC_API_KEY=sk-ant-...      # ANTHROPIC_MODEL defaults to claude-sonnet-5
GEMINI_API_KEY=...                # GEMINI_MODEL   defaults to gemini-2.5-flash
OPENAI_API_KEY=sk-...             # OPENAI_MODEL   defaults to gpt-4.1
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Set several and the orchestrator uses the first and falls back down the list on
provider errors. `Nexus_AI_PROVIDER` chooses which is preferred.

**Without a key the app still works.** Profiling, measures, trends, breakdowns,
anomaly detection, forecasting, recommendations, charts and the PDF report are
all statistical and run regardless. What you lose is natural-language question
understanding; summaries are assembled from computed values instead.

---

## How an analysis runs

```
question
   ↓
AI planner            chooses which tools answer the question
   ↓
dataset schema        real column types, roles, missing counts
   ↓
tool selection        one of 8 controlled tools — nothing else is reachable
   ↓
DuckDB / statistics   the calculation actually happens here
   ↓
verified result       numbers exist before any prose is written
   ↓
AI explanation        narrates the verified numbers
   ↓
verification          every figure in the prose is checked; failures are replaced
   ↓
chart + insight + PDF
```

Each stage is streamed to the browser as it happens, with the real row counts,
timings and SQL. That stream is the product's core feature, not a loading
animation.

### The eight tools

`get_dataset_schema` · `get_column_statistics` · `execute_readonly_sql` ·
`run_data_analysis` · `detect_anomalies` · `forecast_metric` · `create_chart` ·
`generate_report`

There is deliberately no tool for raw database access, the shell, the
filesystem, arbitrary HTTP, or credentials. The model's entire reach is
[`src/lib/ai/tools.ts`](src/lib/ai/tools.ts).

---

## Security

| Concern | How it is handled |
|---|---|
| Passwords | Owned entirely by Supabase Auth. This app never stores or hashes one. |
| Username login | Resolved server-side via a `SECURITY DEFINER` function granted only to `service_role`. Returns null for unknown users, and the API answers with the same generic error either way, so accounts cannot be enumerated. |
| Multi-tenancy | RLS on every tenant table, with membership resolved through `SECURITY DEFINER` helpers so policies cannot recurse. |
| AI-generated SQL | Validated before execution: single statement, read-only shape, forbidden keywords and functions rejected, table allow-list checked against DuckDB's own parser, row cap and hard timeout applied. |
| Query engine | Each dataset loads into its own DuckDB instance which is then *sealed*: `enable_external_access=false`, extension autoloading off, `lock_configuration=true`. DuckDB itself then refuses filesystem and network access — verified, not assumed. |
| Prompt injection | Dataset content is fenced in `<untrusted_data>` blocks with fence-breaking and invisible characters stripped. More importantly, capability limits mean an obeyed instruction still cannot reach anything dangerous. |
| Invented numbers | Every numeric claim in model prose is matched against engine-computed values. On failure the prose is replaced with a deterministic summary and the substitution is shown to the user. |
| Uploads | Extension, size and content-signature checked; stored in a private bucket under `organization_id/user_id/dataset_id/`. |
| Headers | Per-request CSP with a nonce, HSTS, frame-deny, nosniff, referrer policy. |
| Audit | Append-only log of sign-in, upload, analysis, export, deletion and permission events. Never records passwords, tokens or secrets. |

---

## Commands

```bash
npm run dev        # development server
npm run build      # production build
npm start          # serve the production build
npm test           # statistics, verification and SQL-guard tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

---

## Project layout

```
src/
  app/
    (auth)/            sign-in, sign-up, password reset
    (app)/             the authenticated product surface
    api/               upload, streaming analysis, preview, PDF, download
    onboarding/        profile + workspace creation
  components/
    analysis/          Ask AI surface and the live activity stream
    charts/            chart renderer driven by the computed ChartSpec
    datasets/          upload, dataset table, paginated preview
    shell/             sidebar, top bar, app shell
    ui/                design primitives
  lib/
    ai/                provider abstraction, tools, orchestrator, verification
    analysis/          statistics, anomaly detection, forecasting, chart choice,
                       the automatic analysis
    auth/              session resolution and auth actions
    duckdb/            sealed engine and the SQL guard
    ingest/            file validation, loading, profiling, quality scoring
    report/            PDF generation and vector chart geometry
    storage/           private object storage (Supabase or local)
    store/             data access, one interface over both backends
supabase/migrations/   schema, RLS policies, storage bucket
tests/                 unit tests for the statistical and safety layers
scripts/               sample data generator, PDF page renderer
```

---

## Report branding

Under **Settings → Report branding** you can set a business name, upload a logo
and an authorised signature, and record the signatory's name and title. These
are embedded into both the PDF and the Excel export, so a report can go straight
to a client or into a board pack without being reformatted.

Images are capped at 400 KB, checked against their content signature, and stored
as data URLs. Only workspace owners and admins can change them.

## Known limitations

- **Not yet built:** Dashboards, Explore, Cohorts, Data Studio, Models, Alerts
  and Metrics. Those screens say so plainly rather than showing placeholder
  charts.
- **Resource articles** on the landing page are titled and described but not
  written; each card says "Coming soon" rather than linking to an empty page.
- **Paid plans are not purchasable.** Pricing is presented and credit limits per
  plan are enforced in code, but no payment provider is connected, so the Pro,
  Business and Enterprise buttons lead to sign-up or email.
- **Tailwind, not Bootstrap.** The spec lists both Bootstrap CSS and shadcn/ui;
  shadcn/ui is built on Tailwind and the two cannot be combined. Tailwind v4 was
  used, which is what the reference design assumes.
- **Python sandbox.** Advanced analytics currently run in DuckDB and TypeScript.
  The isolated-Python job runner described in the spec is not implemented; the
  DuckDB sandbox covers the same threat model for the analyses that exist today.
- **Billing.** Usage is tracked and the schema carries plans and subscriptions,
  but no payment provider is wired up.
- **XLSX only.** Legacy `.xls` is rejected with a message telling the user to
  re-save as `.xlsx`.
