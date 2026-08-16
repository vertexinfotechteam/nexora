import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { completeOnboardingAction } from "./actions";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard");

  const session = await getSession();
  if (!session) redirect("/login");
  // Already has a workspace.
  if (session.organizationId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--nx-bg)] px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--nx-accent)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--nx-accent-fg)]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">NEXORA AI</span>
        </div>
        <OnboardingForm
          action={completeOnboardingAction}
          defaultUsername={session.username}
          defaultDisplayName={session.displayName ?? ""}
        />
      </div>
    </div>
  );
}
