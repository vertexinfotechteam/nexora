import Link from "next/link";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

/**
 * Shown for navigation entries that are part of the product plan but not yet
 * implemented. Saying so plainly is better than a screen of placeholder charts
 * that would imply the feature works.
 */
export function NotBuiltYet({
  title,
  description,
  plannedFor,
}: {
  title: string;
  description: string;
  plannedFor: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">{description}</p>
      </div>
      <EmptyState
        icon={<Construction className="h-4 w-4" />}
        title="Not built yet"
        description={`This screen is part of the product plan (${plannedFor}) but is not implemented. Nothing is shown here rather than placeholder data, so you are never looking at numbers that are not real.`}
        action={
          <div className="flex gap-2">
            <Button asChild variant="accent" size="sm">
              <Link href="/ask-ai">Ask AI</Link>
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
