import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listRecommendations } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  SectionLabel,
} from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Recommendations" };
export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
  const session = await requireSession();
  const recommendations = await listRecommendations(session, 100);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">
          Recommendations
        </h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Each one is derived from measured values and shows the evidence behind
          it.
        </p>
      </div>

      {recommendations.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="h-4 w-4" />}
          title="No recommendations yet"
          description="Recommendations are generated from the automatic analysis. Analyse a dataset and any finding strong enough to act on will appear here with its supporting figures."
          action={
            <Button asChild variant="accent">
              <Link href="/ask-ai">Run an analysis</Link>
            </Button>
          }
          className="py-16"
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {recommendations.map((recommendation) => (
            <Card key={recommendation.id}>
              <CardBody className="p-4">
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <h2 className="text-[13.5px] font-semibold leading-snug">
                    {recommendation.title}
                  </h2>
                  <div className="flex shrink-0 items-center gap-1">
                    {recommendation.impact ? (
                      <Badge
                        tone={recommendation.impact === "High" ? "error" : "warning"}
                      >
                        {recommendation.impact}
                      </Badge>
                    ) : null}
                    {recommendation.confidence !== null ? (
                      <Badge tone="neutral">{recommendation.confidence}%</Badge>
                    ) : null}
                  </div>
                </div>

                <p className="text-[12.5px] leading-relaxed text-[var(--nx-text-muted)]">
                  {recommendation.body}
                </p>

                {recommendation.evidence.length > 0 ? (
                  <div className="mt-3">
                    <SectionLabel className="mb-1.5">Evidence</SectionLabel>
                    <dl className="space-y-0.5">
                      {recommendation.evidence.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-baseline justify-between gap-3 border-b border-[var(--nx-border-subtle)] py-1"
                        >
                          <dt className="text-[11.5px] text-[var(--nx-text-muted)]">
                            {item.label}
                          </dt>
                          <dd className="shrink-0 text-right font-mono text-[11.5px]">
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                <p className="mt-2 text-[10.5px] text-[var(--nx-text-faint)]">
                  {relativeTime(recommendation.created_at)}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
