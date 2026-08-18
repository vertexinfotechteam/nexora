/**
 * Vertex Infotech company profile.
 *
 * One place for everything the brochure page states about the company, so a
 * phone number or an address is corrected once rather than hunted through
 * markup.
 *
 * Anything here is published to anyone who visits. Two fields are deliberately
 * left for a human to fill:
 *
 *   - `phone` drives a tap-to-call link. A wrong number on a brochure sends
 *     real callers to a stranger.
 *   - `clients` names businesses as customers. Inventing those would be a
 *     false endorsement claim, so the section stays hidden until real names
 *     are added with the client's agreement.
 */

export const VERTEX = {
  name: "Vertex Infotech",
  product: "Nexus",
  tagline: "Software that makes a business legible to the people running it.",
  founded: "2024",
  location: "Gujarat, India",

  /** Set these before the page goes in front of anyone. */
  phone: "",              // e.g. "+91 98765 43210"
  phoneDisplay: "",       // how it should read on screen
  email: "vertexinfotech.team@gmail.com",
  website: "https://nexora1-topaz.vercel.app",

  /**
   * Businesses using Nexus, added only with their permission.
   * Empty until then — an invented logo wall is a lie told at scale.
   */
  clients: [] as { name: string; industry: string; note: string }[],
} as const;

/** The problems a business has before it has this, stated as they are lived. */
export const PROBLEMS = [
  {
    title: "The month closes and nobody knows why",
    body: "Revenue moved. Somebody asks by how much and because of what. The answer takes two days of spreadsheet work, and by the time it arrives the month has moved on.",
  },
  {
    title: "Every report is built by hand",
    body: "The same pivot, the same chart, the same copy-paste into a document, every single month. It is the work of a skilled person doing something a machine should have done.",
  },
  {
    title: "Numbers that disagree with each other",
    body: "Two people pull the same figure and get different answers, because the filters were different. Nobody can say which one is right, so nobody fully trusts either.",
  },
  {
    title: "Problems found long after they mattered",
    body: "A cost drifted upward for four months before anyone noticed. The data always said so — no one was looking at it in a way that would show it.",
  },
  {
    title: "Analysis needs a specialist",
    body: "The question is simple. Answering it needs SQL, or a formula nobody else understands, or the one person who built the sheet and has since left.",
  },
] as const;

/** What changes once it is in place. Each one answers a problem above. */
export const ADVANTAGES = [
  {
    title: "An answer in minutes, not days",
    body: "Upload the file, ask in plain English. Profiling, totals, breakdowns, anomalies and a forecast come back while you watch each step run.",
  },
  {
    title: "The report writes itself",
    body: "Every analysis becomes a PDF and an Excel workbook carrying your own logo and signature, ready to send without retyping a figure.",
  },
  {
    title: "One number, one definition",
    body: "Figures are computed by the engine, not typed by a person or guessed by a model. The same question gives the same answer to everyone who asks it.",
  },
  {
    title: "Told before it becomes expensive",
    body: "Anomaly detection runs on every analysis, using robust statistics that a single outlier cannot distort. A drift is flagged while it is still small.",
  },
  {
    title: "Anyone on the team can ask",
    body: "No SQL, no formulas, no waiting for the one person who knows. If you can describe what you want, you can get it.",
  },
] as const;

/** What the company builds and sells. */
export const SERVICES = [
  {
    title: "AI data analysis",
    body: "Nexus reads your spreadsheet, computes every figure, and explains what it found in language a non-analyst can act on.",
  },
  {
    title: "Reporting that ships",
    body: "Branded PDF and Excel output — executive summary, charts, anomalies, forecast and the full method trail behind every number.",
  },
  {
    title: "Invoices and quotations",
    body: "Paste rough details, get a clean document with your branding, ready to send to a customer.",
  },
  {
    title: "Custom software",
    body: "Web applications, dashboards and internal tools built for how a specific business actually works.",
  },
] as const;

/** Why the product behaves the way it does. */
export const PRINCIPLES = [
  {
    title: "The AI never does the arithmetic",
    body: "It plans and explains. Every figure is computed by the engine, and anything the model cannot prove against a computed value is refused before it reaches a screen.",
  },
  {
    title: "You can check any number",
    body: "Each result carries the query that produced it. Nothing asks to be taken on trust.",
  },
  {
    title: "Your data stays yours",
    body: "It is never used to train a model and never shared outside the company. Uploads load into a sealed engine with no network and no filesystem access.",
  },
] as const;
