import type { Metadata } from "next";
import { PremiumFeature } from "@/components/shell/premium-feature";

export const metadata: Metadata = { title: "Saved Formulas" };

export default function ModelsPage() {
  return (
    <PremiumFeature
      title="Saved Formulas"
      description="Reusable calculations you define once and apply to any file."
      summary="Saved Formulas let you name a calculation — margin, growth, cost per unit — and reuse it across every file you upload, so the same number is worked out the same way every time."
    />
  );
}
