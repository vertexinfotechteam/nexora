import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Metrics" };

export default function Page() {
  return (
    <NotBuiltYet
      title="Metrics"
      description="Define governed metric definitions shared across the workspace."
      plannedFor="Phase 5 — SaaS"
    />
  );
}
