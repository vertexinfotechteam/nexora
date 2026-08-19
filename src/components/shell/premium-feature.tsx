import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

/**
 * Shown for the screens that are part of a paid plan.
 *
 * Deliberately different from NotBuiltYet: that one admits a screen does not
 * exist, this one says the screen is not included. Telling someone a feature
 * they are paying to unlock "is not built yet" is the wrong answer to a
 * question about their plan.
 */
export function PremiumFeature({
  title,
  description,
  summary,
}: {
  title: string;
  description: string;
  summary: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">{description}</p>
      </div>
      <EmptyState
        icon={<Sparkles className="h-4 w-4" />}
        title="A premium feature"
        description={`${summary} It is part of the paid plans rather than the free one — your data, credits and everything you have already produced are unaffected.`}
        action={
          <div className="flex gap-2">
            <Button asChild variant="accent" size="sm">
              <Link href="/upgrade">See the plans</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/dashboard">Back to overview</Link>
            </Button>
          </div>
        }
        className="py-20"
      />
    </div>
  );
}
