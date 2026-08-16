"use client";

import { useState } from "react";
import { AmbientBackground } from "@/components/visual/ambient-background";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import type { Session } from "@/lib/store/types";
import type { CreditBalance } from "@/lib/credits";

export function AppShell({
  session,
  credits,
  children,
}: {
  session: Session;
  credits: CreditBalance;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-[var(--nx-bg)]">
      <AmbientBackground />
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        isAdmin={session.role === "owner" || session.role === "admin"}
      />
      <div className="flex min-h-screen flex-col transition-[padding] lg:pl-[204px]">
        <TopBar
          session={session}
          credits={credits}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-3 sm:p-4">{children}</main>
        <footer className="flex items-center justify-between border-t border-[var(--nx-border)] px-4 py-2 text-[10.5px] text-[var(--nx-text-faint)]">
          <span>All times shown in UTC</span>
          <span>
            {session.mode === "local"
              ? "Local mode — data stored on this machine"
              : "Connected to Supabase"}
          </span>
        </footer>
      </div>
    </div>
  );
}
