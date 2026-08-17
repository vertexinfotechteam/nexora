import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ASSISTANT_FALLBACK,
  ASSISTANT_SYSTEM_PROMPT,
  findRelevant,
} from "@/lib/ai/assistant";
import { enforceLimit } from "@/lib/security/guard";
import { completeWithFallback, hasAiProvider } from "@/lib/ai/provider";
import { sanitizeUntrusted } from "@/lib/ai/prompts";

/**
 * Public product assistant. Available without an account, which is what makes
 * it genuinely 24/7 — it answers from a curated knowledge base and only uses a
 * model to phrase those facts more naturally when one is configured.
 */

const bodySchema = z.object({
  message: z.string().trim().min(1).max(500),
});

/** Crude per-IP rate limit so an open endpoint cannot be used as free inference. */
const BUCKET = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = BUCKET.get(key);
  if (!entry || now > entry.resetAt) {
    BUCKET.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  if (BUCKET.size > 5000) BUCKET.clear(); // bound memory
  return entry.count > MAX_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  // Abuse throttle. Returns a 429 and leaves the success path below
  // exactly as it was.
  const limited = await enforceLimit("ai");
  if (limited) return limited;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many questions in a short time. Try again in a minute." },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }

  const question = parsed.data.message;
  const matches = findRelevant(question);

  // No match at all: say so rather than improvising.
  if (matches.length === 0) {
    return NextResponse.json({ answer: ASSISTANT_FALLBACK, source: "fallback" });
  }

  const best = matches[0].entry;

  if (!hasAiProvider()) {
    return NextResponse.json({ answer: best.answer, source: "knowledge-base" });
  }

  try {
    const facts = matches
      .map((match) => `- ${match.entry.question} ${match.entry.answer}`)
      .join("\n");

    const { response } = await completeWithFallback({
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          text: `Visitor question: ${sanitizeUntrusted(question, 500)}

VERIFIED FACTS:
${facts}`,
        },
      ],
      maxTokens: 300,
    });

    const answer = response.text.trim();

    // A truncated reply reads as a broken product. The curated answer is
    // complete and says the same thing, so prefer it over half a sentence.
    if (!answer || response.stopReason === "max_tokens") {
      return NextResponse.json({ answer: best.answer, source: "knowledge-base" });
    }
    return NextResponse.json({ answer, source: "ai" });
  } catch {
    // Provider down: the curated answer is still correct and complete.
    return NextResponse.json({ answer: best.answer, source: "knowledge-base" });
  }
}
