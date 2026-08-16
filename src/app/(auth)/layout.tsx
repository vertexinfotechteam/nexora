import Link from "next/link";
import { COMPANY } from "@/lib/team";
import { LogoMark } from "@/components/brand/logo";

/**
 * Centred-card auth shell.
 *
 * A single card floats over a diagonal dark-to-teal backdrop, with the brand
 * mark stacked above the heading inside the card. Every auth screen (sign in,
 * sign up, forgot/reset password) shares this frame so the flow reads as one
 * consistent surface.
 */

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#12181c]">
      {/* Diagonal dark-to-teal backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(120deg, #12181c 0%, #141b20 42%, #0b4a3c 54%, #0e7a5c 72%, #12a483 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "linear-gradient(135deg, rgba(0,0,0,0.28) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.18) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#17e0a8] opacity-[0.12] blur-[140px]"
      />

      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <LogoMark className="h-10 w-10" />
          <span className="text-[17px] font-semibold tracking-tight text-white">
            {COMPANY.product}
          </span>
        </Link>

        <div className="w-full max-w-[440px] rounded-2xl border border-white/10 bg-[var(--nx-card)] p-7 shadow-2xl sm:p-9">
          {children}
        </div>

        <p className="mt-6 text-center text-[11.5px] text-white/60">
          A product by <span className="font-medium text-white/85">{COMPANY.name}</span> ·{" "}
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
