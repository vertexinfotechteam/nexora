"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The operations tabs.
 *
 * Named for what Nexus actually holds. The panel this is modelled on carries
 * tabs for reconciliation and demo meetings; neither exists here, and a tab
 * leading to an empty screen is worse than no tab.
 */
const TABS = [
  { href: "/operations", label: "Overview" },
  { href: "/operations/accounts", label: "Accounts" },
  { href: "/operations/messages", label: "Messages" },
  { href: "/operations/audit", label: "Audit" },
];

export function OperationsNav() {
  const pathname = usePathname();

  // The overview owns the root path only; every other tab owns its subtree, so
  // an account detail page keeps Accounts marked as current.
  const isCurrent = (href: string) =>
    href === "/operations" ? pathname === "/operations" : pathname.startsWith(href);

  return (
    <nav className="mx-auto max-w-[1600px] px-5">
      <ul className="flex flex-wrap items-center gap-1 pt-3">
        {TABS.map((tab) => {
          const current = isCurrent(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 px-3 py-2.5 text-[13px] transition-colors",
                  current
                    ? "border-[#3fb489] font-semibold text-white"
                    : "border-transparent text-white/60 hover:text-white",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
