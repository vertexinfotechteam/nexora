"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { saveContactMessage } from "@/lib/contact";

/**
 * Handles the public "ask our team" form.
 *
 * The form is open to anonymous visitors, so everything in the body is
 * untrusted: identity and request context are taken from the session and the
 * request headers instead, never from submitted fields.
 */

export type ContactState = {
  error?: string;
  success?: string;
};

const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter an email address we can reply to.")
    .max(254),
  subject: z.string().trim().min(1, "Tell us what this is about.").max(160),
  message: z
    .string()
    .trim()
    .min(10, "Add a little more detail so we can help.")
    .max(4000, "That is longer than we can accept — please summarise."),
  // Honeypot. Real people never see this field, so anything in it is a bot.
  company_website: z.string().max(0).optional().or(z.literal("")),
});

/**
 * In-process submission throttle, keyed by IP.
 *
 * This is a single-instance guard, not a distributed one: it makes casual form
 * spam ineffective without pretending to be infrastructure it is not. Behind
 * multiple instances, put a real limiter at the edge.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function withinRateLimit(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(key, hits);
    return false;
  }

  hits.push(now);
  recent.set(key, hits);

  // Without this the map grows for the life of the process.
  if (recent.size > 5000) {
    for (const [entry, times] of recent) {
      if (times.every((at) => now - at >= WINDOW_MS)) recent.delete(entry);
    }
  }
  return true;
}

export async function submitContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    company_website: formData.get("company_website") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  // A filled honeypot is a bot. Report success so it learns nothing, and
  // store nothing.
  if (parsed.data.company_website) {
    return { success: "Thanks — your message is with our team." };
  }

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";

  if (!withinRateLimit(ip)) {
    return {
      error:
        "That is a few messages in a short time. Give it a few minutes, or email us directly.",
    };
  }

  const session = await getSession();

  const result = await saveContactMessage({
    name: parsed.data.name,
    email: parsed.data.email,
    subject: parsed.data.subject,
    message: parsed.data.message,
    userId: session?.userId ?? null,
    sourcePath: headerList.get("referer"),
    userAgent: headerList.get("user-agent"),
  });

  if (!result.ok) {
    return {
      error: `Your message could not be saved. ${result.error}`,
    };
  }

  return {
    success:
      "Thanks — your message is with our team. We reply to most questions within one working day.",
  };
}
