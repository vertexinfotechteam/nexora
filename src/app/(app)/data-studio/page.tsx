import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Data Studio" };

export default function Page() {
  return (
    <NotBuiltYet
      title="Data Studio"
      description="Transform, join and shape datasets before analysis."
      plannedFor="Phase 4 — Analytics"
    />
  );
}
