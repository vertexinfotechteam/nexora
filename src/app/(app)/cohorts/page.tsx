import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Cohorts" };

export default function Page() {
  return (
    <NotBuiltYet
      title="Cohorts"
      description="Group users or accounts and compare their behaviour over time."
      plannedFor="Phase 4 — Analytics"
    />
  );
}
