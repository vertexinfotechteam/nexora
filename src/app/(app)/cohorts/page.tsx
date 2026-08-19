import type { Metadata } from "next";
import { PremiumFeature } from "@/components/shell/premium-feature";

export const metadata: Metadata = { title: "Customer Groups" };

export default function CohortsPage() {
  return (
    <PremiumFeature
      title="Customer Groups"
      description="Group customers or accounts and compare them over time."
      summary="Customer Groups let you split your customers into groups you define and watch how each group behaves month after month, so you can see which ones grow and which quietly leave."
    />
  );
}
