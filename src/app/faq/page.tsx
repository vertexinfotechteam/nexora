import type { Metadata } from "next";
import { MarketingPage } from "@/components/landing/page-shell";
import { KNOWLEDGE_BASE } from "@/lib/ai/assistant";

export const metadata: Metadata = { title: "FAQ" };

/**
 * The FAQ and the 24/7 assistant read from the same knowledge base, so the two
 * can never drift apart and give a visitor different answers.
 */
export default function FaqPage() {
  return (
    <MarketingPage
      eyebrow="Company"
      title="Frequently asked questions"
      intro="The same answers the assistant gives, in one place. Ask it anything not covered here."
    >
      <div className="divide-y divide-[var(--nx-border)]">
        {KNOWLEDGE_BASE.map((entry) => (
          <details key={entry.id} className="group py-4" open={entry.id === "what-is"}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold">
              {entry.question}
              <span
                aria-hidden
                className="shrink-0 text-[20px] font-normal leading-none text-[var(--nx-text-faint)] transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--nx-text-muted)]">
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </MarketingPage>
  );
}
