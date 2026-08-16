import Link from "next/link";
import { Sparkles } from "lucide-react";
import { COMPANY } from "@/lib/team";
import { LogoMark } from "@/components/brand/logo";

/**
 * Split-screen auth shell.
 *
 * Left: the form on the light brand surface. Right: a dark panel carrying the
 * product promise and the three ideas the platform is built on. The panel is
 * hidden below `lg` so small screens get the form full width rather than a
 * squeezed two-up.
 */

const PILLARS = [
  {
    term: "Computed",
    detail: "Every figure comes from the engine, never the model",
  },
  {
    term: "Verified",
    detail: "Unprovable numbers are rejected before you see them",
  },
  {
    term: "Sealed",
    detail: "The query engine has no network and no filesystem",
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col bg-[var(--nx-bg)] px-5 py-8 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="text-[16px] font-semibold tracking-tight">
            {COMPANY.product}
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>

        <p className="text-center text-[11.5px] text-[var(--nx-text-muted)]">
          A product by{" "}
          <span className="font-medium text-[var(--nx-text)]">
            {COMPANY.name}
          </span>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-[var(--nx-text)]">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="hover:text-[var(--nx-text)]">
            Privacy
          </Link>
        </p>
      </div>

      {/* Story side */}
      <aside className="relative hidden flex-col justify-center overflow-hidden bg-[#1c1a17] px-12 py-16 lg:flex">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#0a4a3c] opacity-40 blur-[100px]"
        />
        <div className="relative max-w-lg">
          <blockquote className="text-[30px] font-semibold leading-[1.24] tracking-tight text-[#f7f4ef]">
            &ldquo;From a one-line question to a board-ready analysis — with
            every number still traceable to your data.&rdquo;
          </blockquote>

          <p className="mt-6 text-[14px] leading-relaxed text-[#a9a196]">
            {COMPANY.product} — AI data analytics, built by {COMPANY.name}.
          </p>

          <div className="my-10 h-px bg-[#3a332d]" />

          <dl className="grid grid-cols-3 gap-6">
            {PILLARS.map((pillar) => (
              <div key={pillar.term}>
                <dt className="text-[16px] font-semibold text-[#f7f4ef]">
                  {pillar.term}
                </dt>
                <dd className="mt-1.5 text-[12.5px] leading-relaxed text-[#9c9488]">
                  {pillar.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
