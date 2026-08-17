import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getCreditBalance } from "@/lib/credits";
import { Badge, Card, CardBody } from "@/components/ui/primitives";
import { formatPrice, isPlanId, PLAN_LIST, PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

/**
 * Plans, and what happens when one is chosen.
 *
 * Checkout is not built — no payment provider is connected yet — so choosing a
 * plan says exactly that rather than opening a form that cannot take money.
 * A checkout that fails silently costs more trust than one that has not
 * arrived.
 */
export default async function UpgradePage(props: PageProps<"/upgrade">) {
  const session = await requireSession();
  const credits = await getCreditBalance(session);

  const params = await props.searchParams;
  const chosen = typeof params.plan === "string" && isPlanId(params.plan)
    ? params.plan
    : null;

  if (chosen && chosen !== "free") {
    const plan = PLANS[chosen];
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <CardBody className="p-6 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--nx-accent-soft)]">
              <Clock className="h-5 w-5 text-[var(--nx-accent)]" />
            </span>
            <h1 className="mt-4 text-[18px] font-semibold tracking-tight">
              {plan.name} — coming soon
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--nx-text-muted)]">
              Online payment is not switched on yet, so we cannot take money for
              the {plan.name} plan here. Everything else about the plan is
              ready — only the checkout is missing.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--nx-text-muted)]">
              If you want this plan now, write to us from the contact form and
              we will set it up on your account by hand.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Link
                href="/#contact"
                className="nx-press inline-flex h-9 items-center rounded-md bg-[var(--nx-purple)] px-4 text-[13px] font-medium text-[var(--nx-purple-on)] hover:bg-[var(--nx-purple-hover)]"
              >
                Ask us to set it up
              </Link>
              <Link
                href="/upgrade"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--nx-border)] px-3 text-[13px] hover:bg-[var(--nx-hover)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All plans
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Plans</h1>
        <p className="mt-0.5 text-[12px] text-[var(--nx-text-muted)]">
          You are on the {PLANS[session.plan === "free" ? "free" : "free"].name}{" "}
          plan with {credits.remaining} of {credits.limit} credits left.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {PLAN_LIST.map((plan) => {
          const current = plan.id === "free" && session.plan === "free";
          return (
            <Card
              key={plan.id}
              className={
                plan.popular ? "border-[var(--nx-accent-border-strong)]" : undefined
              }
            >
              <CardBody className="flex h-full flex-col p-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-[14px] font-semibold">{plan.name}</h2>
                  {plan.popular ? <Badge tone="success">Most chosen</Badge> : null}
                  {current ? <Badge tone="neutral">Your plan</Badge> : null}
                </div>

                <p className="mt-2 text-[24px] font-semibold leading-none tracking-tight">
                  {formatPrice(plan)}
                </p>
                <p className="mt-1 text-[11px] text-[var(--nx-text-faint)]">
                  {plan.period}
                </p>

                <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
                  {plan.tagline}
                </p>

                <p className="mt-3 text-[12px] font-medium">
                  {plan.credits === null
                    ? "Unlimited analyses"
                    : `${plan.credits} analysis credits`}
                </p>

                <ul className="mt-2 flex-1 space-y-1.5">
                  {plan.highlights.map((line) => (
                    <li key={line} className="flex items-start gap-1.5">
                      <Check className="mt-px h-3 w-3 shrink-0 text-[var(--nx-success)]" />
                      <span className="text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>

                {plan.id === "free" ? (
                  <p className="mt-4 text-center text-[11.5px] text-[var(--nx-text-faint)]">
                    {current ? "You are on this plan" : "Included with every account"}
                  </p>
                ) : (
                  <Link
                    href={`/upgrade?plan=${plan.id}`}
                    className="nx-press mt-4 inline-flex h-9 items-center justify-center rounded-md bg-[var(--nx-purple)] text-[13px] font-medium text-[var(--nx-purple-on)] transition-colors hover:bg-[var(--nx-purple-hover)]"
                  >
                    Choose {plan.name}
                  </Link>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-[11.5px] text-[var(--nx-text-faint)]">
        Prices are in Indian rupees. Online payment is not switched on yet —
        choosing a plan tells you how to get it set up.
      </p>
    </div>
  );
}
