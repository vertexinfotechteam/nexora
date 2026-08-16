"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Section switcher for the admin panel.
 *
 * Client-side rather than routed, so moving between sections does not refetch
 * the whole panel. Sections the operator's role cannot see are filtered out by
 * the server before they reach this component.
 */
export function AdminTabs({
  sections,
}: {
  sections: { id: string; label: string; count?: number | null; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(sections[0]?.id);
  const current = sections.find((section) => section.id === active) ?? sections[0];

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex flex-wrap items-center gap-1 border-b border-[var(--nx-border)] pb-2"
      >
        {sections.map((section) => {
          const selected = section.id === current?.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(section.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
                selected
                  ? "bg-[var(--nx-accent-soft)] font-medium text-[var(--nx-accent-fg-on-soft)]"
                  : "text-[var(--nx-text-muted)] hover:bg-[var(--nx-hover)] hover:text-[var(--nx-text)]",
              )}
            >
              {section.label}
              {typeof section.count === "number" && section.count > 0 ? (
                <span className="rounded-full bg-[var(--nx-elevated)] px-1.5 text-[10px] font-medium text-[var(--nx-text-muted)]">
                  {section.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
