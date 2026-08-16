import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Alerts" };

export default function Page() {
  return (
    <NotBuiltYet
      title="Alerts"
      description="Get notified when a metric crosses a threshold or an anomaly is found."
      plannedFor="Phase 5 — SaaS"
    />
  );
}
