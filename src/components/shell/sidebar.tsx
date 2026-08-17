"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, Lock, PanelLeft, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav-config";
import { Badge } from "@/components/ui/primitives";
import { LogoMark } from "@/components/brand/logo";
import type { Feature } from "@/lib/plans";

export function Sidebar({
  mobileOpen,
  onMobileClose,
  isAdmin,
  planFeatures,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
  isAdmin: boolean;
  /** Features the current plan includes; anything else shows a padlock. */
  planFeatures: readonly Feature[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Mobile scrim */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          "nx-rail-scope fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--nx-rail-border)] bg-[linear-gradient(180deg,var(--nx-rail)_0%,var(--nx-rail-deep)_100%)] text-[var(--nx-rail-text)] transition-[width,transform] duration-200",
          collapsed ? "w-[56px]" : "w-[204px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--nx-rail-border)] px-3.5">
          <LogoMark className="h-6 w-6" />
          {!collapsed ? (
            <span className="truncate text-[15px] font-bold tracking-tight text-white">
              Nexus
            </span>
          ) : null}
          <button
            type="button"
            onClick={onMobileClose}
            className="ml-auto text-[var(--nx-rail-muted)] hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (item) => !item.adminOnly || isAdmin,
            );
            if (items.length === 0) return null;
            return (
            <div key={group.label} className="mb-4">
              {!collapsed ? (
                <p className="mb-1.5 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--nx-rail-dim)]">
                  {group.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  const locked = Boolean(
                    item.feature && !planFeatures.includes(item.feature),
                  );
                  return (
                    <li key={item.href}>
                      {/*
                        One highlight, one meaning.
                        Hover used to paint a filled block too, so a page you
                        were merely pointing at looked as selected as the page
                        you were on. The current page now owns the green — bar,
                        tint and weight — and hover is a plain neutral wash.
                      */}
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        aria-current={active ? "page" : undefined}
                        title={
                          locked
                            ? `${item.label} — not included in your plan`
                            : collapsed
                              ? `${item.label} — ${item.hint}`
                              : item.hint
                        }
                        className={cn(
                          "group relative flex items-center gap-2 rounded-md py-[7px] pl-2.5 pr-2 text-[12.5px] transition-colors",
                          active
                            ? "bg-[var(--nx-rail-active)] font-semibold text-[var(--nx-rail-active-text)] shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                            : "text-[var(--nx-rail-muted)] hover:bg-[var(--nx-rail-hover)] hover:text-white",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[15px] w-[15px] shrink-0",
                            active
                              ? "text-[var(--nx-rail-active-text)]"
                              : "text-[var(--nx-rail-dim)] group-hover:text-[var(--nx-rail-muted)]",
                          )}
                        />
                        {!collapsed ? (
                          <>
                            <span className="truncate">{item.label}</span>
                            {item.badge ? (
                              <Badge tone="cyan" className="ml-auto shrink-0">
                                {item.badge}
                              </Badge>
                            ) : null}
                            {/*
                              A padlock rather than "Soon".
                              The page exists; it is the plan that does not
                              reach it, and those are different problems with
                              different fixes. Clicking still works and lands
                              on a page that explains which.
                            */}
                            {locked ? (
                              <Lock
                                className="ml-auto h-3 w-3 shrink-0 text-[var(--nx-rail-dim)]"
                                aria-label="Not included in your plan"
                              />
                            ) : item.status === "planned" ? (
                              <span className="ml-auto shrink-0 rounded px-1 py-px text-[9.5px] font-medium uppercase tracking-wide text-[var(--nx-rail-dim)]">
                                Soon
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
        </nav>

        {/* Collapse */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "hidden h-10 shrink-0 items-center gap-2 border-t border-[var(--nx-rail-border)] px-3.5 text-[12px] text-[var(--nx-rail-dim)] transition-colors hover:text-white lg:flex",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </aside>
    </>
  );
}
