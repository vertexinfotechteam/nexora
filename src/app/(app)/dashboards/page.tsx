import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Dashboards" };

export default function Page() {
  return (
    <NotBuiltYet
      title="Dashboards"
      description="Build and share custom dashboards from saved widgets."
      plannedFor="Phase 5 — SaaS"
    />
  );
}
