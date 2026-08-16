import "server-only";

/**
 * The product assistant that answers visitor questions 24/7.
 *
 * Two layers, in order:
 *   1. A curated knowledge base of facts about Nexus. Always available, needs
 *      no API key, and cannot invent anything — this is what makes the
 *      assistant genuinely always-on.
 *   2. When an AI provider is configured, the model rewrites the matched facts
 *      into a natural answer. It is given the facts and told to use nothing
 *      else, so an unavailable provider degrades to layer 1 rather than to
 *      guesswork.
 */

export type KnowledgeEntry = {
  id: string;
  /** Words that should pull this entry up in matching. */
  keywords: string[];
  question: string;
  answer: string;
};

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    id: "what-is",
    keywords: ["what", "nexora", "product", "do", "about", "platform", "explain"],
    question: "What is Nexus?",
    answer:
      "Nexus is a data analytics platform. You upload a spreadsheet or data file, describe what you want in plain English, and it runs the analysis for you — profiling the data, computing the measures, detecting anomalies, fitting a forecast and writing the findings. You watch each step happen live, then download a PDF or Excel report. It is built by Vertex Infotech.",
  },
  {
    id: "credits",
    keywords: ["credit", "credits", "limit", "free", "quota", "how many", "cost", "usage"],
    question: "How many analyses do I get?",
    answer:
      "Every new account starts with 10 AI analysis credits. One credit is used each time you run an analysis. Uploading data, browsing your dashboards, exporting reports you have already generated and using this assistant are all free and do not consume credits. Your remaining balance is shown in the top bar inside the app.",
  },
  {
    id: "accuracy",
    keywords: ["accurate", "accuracy", "trust", "hallucinate", "made up", "invent", "wrong", "real", "verify"],
    question: "Can I trust the numbers?",
    answer:
      "Yes, and the design is what makes that true. The AI never calculates. It plans the analysis and chooses which tools to run, but every figure is computed by the analytics engine from your data. Before any written summary reaches you, each number in it is checked against those computed values — if something does not match, the text is thrown away and rebuilt from verified figures only, and you are told that happened.",
  },
  {
    id: "formats",
    keywords: ["format", "csv", "excel", "xlsx", "json", "parquet", "upload", "file", "support"],
    question: "What file formats can I upload?",
    answer:
      "CSV, TSV, XLSX, JSON and Parquet, up to 100 MB per file. Files are validated and their content signature checked before anything is read. Legacy .xls is not supported — open it in Excel and save as .xlsx first.",
  },
  {
    id: "export",
    keywords: ["export", "pdf", "excel", "download", "report", "logo", "signature", "brand"],
    question: "Can I export results?",
    answer:
      "Yes. Every analysis produces a report you can download as a PDF or an Excel workbook. Both carry your business logo and authorised signature if you add them under Settings, so a report can go straight to a client or a board pack.",
  },
  {
    id: "security",
    keywords: ["secure", "security", "safe", "private", "data", "gdpr", "who can see", "encrypt", "rls"],
    question: "Is my data private?",
    answer:
      "Your files go into private storage that only your workspace can reach, enforced at the database level with row level security. The query engine that reads your data runs sealed — no network access and no filesystem access, verified at the engine itself rather than assumed. Uploaded content is also treated as untrusted input, so instructions hidden inside a spreadsheet cannot make the AI do anything.",
  },
  {
    id: "sql",
    keywords: ["sql", "code", "technical", "analyst", "learn", "skill", "programming", "query"],
    question: "Do I need to know SQL?",
    answer:
      "No. You describe the task in ordinary language. The system writes and runs the queries itself, and shows you exactly which query it ran at each step if you want to check its work.",
  },
  {
    id: "speed",
    keywords: ["fast", "speed", "long", "time", "quick", "wait", "how long"],
    question: "How long does an analysis take?",
    answer:
      "Usually seconds. A 27,000-row dataset profiles and completes a full analysis — measures, trend, breakdowns, anomalies and a forecast — in under a second on typical hardware. Larger files take longer, and you watch the progress live rather than staring at a spinner.",
  },
  {
    id: "signup",
    keywords: ["sign up", "signup", "account", "register", "start", "trial", "create", "join", "password"],
    question: "How do I get started?",
    answer:
      "Choose Create account free in the navigation bar, pick a username and password, and you are taken straight to your own dashboard with 10 credits ready to use. No card is required.",
  },
  {
    id: "team",
    keywords: ["team", "who", "built", "made", "company", "vertex", "founder", "behind"],
    question: "Who builds Nexus?",
    answer:
      "Nexus is built by Vertex Infotech. The team is Tarang Vasoya (Project Lead & CEO), Het Aghera (AI & Backend), Om Bardoliya (Frontend & UI/UX), Dharm Senjaliya (Product & Database) and Navneet Radadiya (QA & Product).",
  },
  {
    id: "forecast",
    keywords: ["forecast", "predict", "future", "projection", "trend", "model"],
    question: "How does forecasting work?",
    answer:
      "Two real statistical models are fitted — Holt's linear trend and additive Holt-Winters — and the better one is chosen by testing it against periods it was not trained on. You get a projection with a confidence range, the model that was used, and its measured error. If the history is too short to be trustworthy, it says so rather than producing a confident-looking line.",
  },
  {
    id: "anomaly",
    keywords: ["anomaly", "anomalies", "outlier", "unusual", "spike", "drop", "detect"],
    question: "How are anomalies detected?",
    answer:
      "Each point is compared against the level implied by the periods around it, and the deviation is scaled by a robust measure that a handful of extreme values cannot distort. You see the actual value, the expected value, the size of the deviation and a confidence figure derived from the statistics — never a number a model made up.",
  },
  {
    id: "contact",
    keywords: ["contact", "support", "help", "email", "talk", "sales", "demo", "human"],
    question: "How do I get help?",
    answer:
      "This assistant is available around the clock for product questions. For anything it cannot answer — enterprise pricing, procurement, custom deployments — use the Contact sales option in the pricing section and a person from Vertex Infotech will follow up.",
  },
];

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "can", "i", "my", "me", "you",
  "your", "it", "to", "of", "and", "or", "for", "in", "on", "with", "how",
  "what", "why", "when", "this", "that", "be", "have", "has",
]);

/**
 * Scores the knowledge base against the question and returns the best matches.
 * Plain lexical overlap — predictable, instant, and no network call.
 */
export function findRelevant(
  question: string,
  limit = 3,
): { entry: KnowledgeEntry; score: number }[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));

  if (words.length === 0) return [];

  const scored = KNOWLEDGE_BASE.map((entry) => {
    const haystack = `${entry.keywords.join(" ")} ${entry.question} ${entry.answer}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      // A keyword hit is worth far more than an incidental mention in prose.
      if (entry.keywords.some((keyword) => keyword.includes(word) || word.includes(keyword))) {
        score += 3;
      } else if (haystack.includes(word)) {
        score += 1;
      }
    }
    return { entry, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export const ASSISTANT_FALLBACK =
  "I can help with questions about what Nexus does, credits and pricing, supported file formats, exports, security, and how the analysis works. Ask me one of those, or use Contact sales in the pricing section to reach the Vertex Infotech team directly.";

export const ASSISTANT_SYSTEM_PROMPT = `You are the product assistant for Nexus, a data analytics platform built by Vertex Infotech.

You will be given a visitor's question and a set of VERIFIED FACTS about the product.

Rules:
- Answer using only the verified facts. Never add features, prices, numbers, dates or claims that are not in them.
- If the facts do not cover the question, say plainly that you do not have that detail and point the visitor to Contact sales.
- Two or three sentences. Warm, direct, no marketing padding, no bullet points, no headings.
- Never promise anything about the visitor's own data, since you cannot see it.`;
