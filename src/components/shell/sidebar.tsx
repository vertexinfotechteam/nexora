"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, PanelLeft, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav-config";
import { Badge } from "@/components/ui/primitives";

export function Sidebar({
  mobileOpen,
  onMobileClose,
  isAdmin,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
  isAdmin: boolean;
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
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--nx-border)] bg-[var(--nx-surface)] transition-[width,transform] duration-200",
          collapsed ? "w-[56px]" : "w-[204px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[var(--nx-border)] px-3">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--nx-accent)]">
            <Sparkles className="h-3 w-3 text-[var(--nx-accent-fg)]" />
          </div>
          {!collapsed ? (
            <span className="truncate text-[13px] font-semibold tracking-tight">
              NEXORA AI
            </span>
          ) : null}
          <button
            type="button"
            onClick={onMobileClose}
            className="ml-auto text-[var(--nx-text-muted)] hover:text-[var(--nx-text)] lg:hidden"
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
                <p className="mb-1 px-2 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-[var(--nx-text-dim)]">
                  {group.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "group flex items-center gap-2 rounded-md px-2 py-[7px] text-[12.5px] transition-colors",
                          active
                            ? "bg-[var(--nx-accent-soft-strong)] text-[var(--nx-accent)]"
                            : "text-[var(--nx-text-muted)] hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)]",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[15px] w-[15px] shrink-0",
                            active
                              ? "text-[var(--nx-accent)]"
                              : "text-[var(--nx-text-dim)] group-hover:text-[var(--nx-text-muted)]",
                          )}
                        />
                        {!collapsed ? (
                          <>
                            <span className="truncate">{item.label}</span>
                            {item.badge ? (
                              <Badge tone="cyan" className="ml-auto">
                                {item.badge}
                              </Badge>
                            ) : null}
                            {item.status === "planned" ? (
                              <span
                                className="ml-auto h-1 w-1 rounded-full bg-[var(--nx-border-strong)]"
                                title="Not implemented yet"
                              />
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
            "hidden h-9 shrink-0 items-center gap-2 border-t border-[var(--nx-border)] px-3 text-[12px] text-[var(--nx-text-dim)] transition-colors hover:text-[var(--nx-text)] lg:flex",
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
