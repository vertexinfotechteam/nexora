import "server-only";

/**
 * Central, validated access to server configuration.
 *
 * Two hard rules enforced here:
 *  1. Secrets (service-role key, AI API keys) are only ever read on the server.
 *     Nothing in this module may be imported from a Client Component — the
 *     `server-only` import above turns that into a build error.
 *  2. The app must boot and be inspectable even when Supabase / AI keys are
 *     absent, so callers get a typed "not configured" result instead of a throw.
 */

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey =
    read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
    read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY") };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/** Where the app persists data when Supabase has not been connected yet. */
export const LOCAL_DATA_DIR = read("NEXORA_DATA_DIR") ?? ".nexora";

export type AiProviderId = "anthropic" | "gemini" | "openai" | "ollama";

export type AiProviderConfig = {
  id: AiProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
};

const DEFAULT_MODELS: Record<AiProviderId, string> = {
  anthropic: "claude-sonnet-5",
  // Newer keys get 404 "no longer available to new users" on the 2.5 line.
  gemini: "gemini-3.6-flash",
  openai: "gpt-4.1",
  ollama: "llama3.1",
};

/**
 * Returns every provider that currently has usable credentials, in preference
 * order. The orchestrator uses the first entry and falls back down the list on
 * provider errors, which is what makes the app genuinely provider-independent.
 */
export function getAvailableAiProviders(): AiProviderConfig[] {
  const preferred = (read("NEXORA_AI_PROVIDER") ?? "").toLowerCase();
  const found: AiProviderConfig[] = [];

  const anthropicKey = read("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    found.push({
      id: "anthropic",
      apiKey: anthropicKey,
      model: read("ANTHROPIC_MODEL") ?? DEFAULT_MODELS.anthropic,
      baseUrl: read("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com",
    });
  }

  const geminiKey = read("GEMINI_API_KEY") ?? read("GOOGLE_API_KEY");
  if (geminiKey) {
    found.push({
      id: "gemini",
      apiKey: geminiKey,
      model: read("GEMINI_MODEL") ?? DEFAULT_MODELS.gemini,
      baseUrl:
        read("GEMINI_BASE_URL") ??
        "https://generativelanguage.googleapis.com/v1beta",
    });
  }

  const openaiKey = read("OPENAI_API_KEY");
  if (openaiKey) {
    found.push({
      id: "openai",
      apiKey: openaiKey,
      model: read("OPENAI_MODEL") ?? DEFAULT_MODELS.openai,
      baseUrl: read("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
    });
  }

  const ollamaUrl = read("OLLAMA_BASE_URL");
  if (ollamaUrl) {
    found.push({
      id: "ollama",
      model: read("OLLAMA_MODEL") ?? DEFAULT_MODELS.ollama,
      baseUrl: ollamaUrl,
    });
  }

  if (preferred) {
    found.sort((a, b) =>
      a.id === preferred ? -1 : b.id === preferred ? 1 : 0,
    );
  }
  return found;
}

/** Hard ceilings applied to every AI-generated query. Never user-configurable. */
export const SQL_LIMITS = {
  /** Milliseconds before an analytical query is cancelled. */
  timeoutMs: Number(read("NEXORA_SQL_TIMEOUT_MS") ?? 15_000),
  /** Maximum rows any single query may return to the app. */
  maxRows: Number(read("NEXORA_SQL_MAX_ROWS") ?? 10_000),
  /** Maximum rows streamed into a chart payload. */
  maxChartRows: 2_000,
} as const;

export const UPLOAD_LIMITS = {
  maxBytes: Number(read("NEXORA_MAX_UPLOAD_BYTES") ?? 100 * 1024 * 1024),
  allowedExtensions: ["csv", "tsv", "xlsx", "xls", "json", "parquet"] as const,
} as const;
