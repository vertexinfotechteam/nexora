import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Explore" };

export default function Page() {
  return (
    <NotBuiltYet
      title="Explore"
      description="Ad-hoc exploration across your datasets without writing SQL."
      plannedFor="Phase 4 — Analytics"
    />
  );
}
