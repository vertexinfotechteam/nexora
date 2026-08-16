"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bell,
  Calendar,
  ChevronDown,
  CircleHelp,
  Filter,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { Session } from "@/lib/store/types";
import type { CreditBalance } from "@/lib/credits";
import { CreditMeter } from "./credit-meter";

export function TopBar({
  session,
  credits,
  onMenuClick,
}: {
  session: Session;
  credits: CreditBalance;
  onMenuClick: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const initials = (session.displayName ?? session.username)
    .split(/[\s_]+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/ask-ai?q=${encodeURIComponent(trimmed)}`);
    setQuery("");
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 flex h-[46px] shrink-0 items-center gap-2 border-b border-[var(--nx-border)] bg-[var(--nx-surface)] px-3">
      <button
        type="button"
        onClick={onMenuClick}
        className="text-[var(--nx-text-muted)] hover:text-[var(--nx-text)] lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/*
       * No workspace switcher.
       *
       * A workspace exists so tenant data can be isolated; it is not something
       * the user chooses between, and a dropdown listing exactly one entry is
       * a control that does nothing. Everything it offered — plan, role,
       * settings — lives on the account menu and the Settings page.
       */}

      {/* AI search */}
      <form onSubmit={submitSearch} className="mx-auto hidden w-full max-w-[420px] md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--nx-text-faint)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask AI or search metrics..."
            aria-label="Ask AI or search metrics"
            className="h-7 w-full rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] pl-8 pr-8 text-[12px] text-[var(--nx-text)] outline-none placeholder:text-[var(--nx-text-faint)] focus:border-[var(--nx-purple)]"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--nx-text-faint)]">
            ⌘K
          </kbd>
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1">
        <CreditMeter balance={credits} />
        <TopBarIcon label="AI insights" href="/ask-ai" icon={Sparkles} accent />
        <TopBarIcon label="Date range" icon={Calendar} />
        <TopBarIcon label="Filters" icon={Filter} />
        <TopBarIcon label="Notifications" icon={Bell} />
        <TopBarIcon label="Help" icon={CircleHelp} />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="ml-1 flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-[var(--nx-elevated)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--nx-purple)] text-[10px] font-semibold text-[var(--nx-purple-on)]">
                {initials || "NX"}
              </span>
              <span className="hidden text-left text-[11.5px] leading-tight sm:block">
                <span className="block max-w-[110px] truncate font-medium">
                  {session.displayName ?? session.username}
                </span>
                <span className="block text-[10px] text-[var(--nx-text-muted)]">
                  {session.plan.toUpperCase()} plan
                </span>
              </span>
              <ChevronDown className="h-3 w-3 text-[var(--nx-text-dim)]" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-[200px] rounded-md border border-[var(--nx-border)] bg-[var(--nx-card)] p-1 text-[12.5px] shadow-xl"
            >
              <div className="px-2 py-1.5">
                <p className="font-medium">{session.displayName ?? session.username}</p>
                <p className="mt-0.5 text-[11px] text-[var(--nx-text-muted)]">
                  @{session.username}
                </p>
                {session.mode === "local" ? (
                  <Badge tone="warning" className="mt-1.5">
                    Local mode
                  </Badge>
                ) : null}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--nx-border)]" />
              <DropdownMenu.Item
                onSelect={() => router.push("/settings")}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[var(--nx-text-muted)] outline-none data-[highlighted]:bg-[var(--nx-elevated)] data-[highlighted]:text-[var(--nx-text)]"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={signOut}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[var(--nx-text-muted)] outline-none data-[highlighted]:bg-[var(--nx-elevated)] data-[highlighted]:text-[var(--nx-error)]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}

function TopBarIcon({
  label,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  accent?: boolean;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={href ? () => router.push(href) : undefined}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--nx-elevated)]",
        accent ? "text-[var(--nx-accent)]" : "text-[var(--nx-text-dim)] hover:text-[var(--nx-text)]",
      )}
    >
      <Icon className="h-[15px] w-[15px]" />
    </button>
  );
}
