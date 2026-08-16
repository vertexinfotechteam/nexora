import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { AmbientBackground } from "@/components/visual/ambient-background";
import { LandingNavbar } from "@/components/landing/navbar";
import { AiAssistant } from "@/components/landing/ai-assistant";
import { Contact } from "@/components/landing/contact";
import {
  FinalCta,
  Footer,
  Hero,
  Pricing,
  Product,
  Resources,
  Team,
} from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "Nexus — Ask a question, get the analysis",
  description:
    "Upload a spreadsheet, describe what you need in plain English, and watch the analysis run step by step. Every figure computed, never guessed. Powered by Vertex Infotech.",
};

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  // Signed-in visitors still get the marketing page, but the calls to action
  // point at their dashboard rather than at sign-up.
  const session = await getSession();
  const signedIn = Boolean(session);

  return (
    <div className="relative min-h-screen bg-[var(--nx-bg)]">
      <AmbientBackground />
      <LandingNavbar signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <Product />
        <Pricing />
        <Resources />
        <Team />
        <Contact />
        <FinalCta signedIn={signedIn} />
      </main>
      <Footer />
      <AiAssistant />
    </div>
  );
}
