import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Models" };

export default function Page() {
  return (
    <NotBuiltYet
      title="Models"
      description="Define reusable semantic models over your raw sources."
      plannedFor="Phase 4 — Analytics"
    />
  );
}
