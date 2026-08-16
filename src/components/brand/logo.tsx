import { cn } from "@/lib/utils";

/**
 * The Nexus mark.
 *
 * An N monogram built from two ribbons — a dark slate downstroke on the left, a
 * green upstroke on the right — with the diagonal carrying a bar chart and a
 * trend line. The two halves read as the letter first and the data second.
 *
 * Drawn as inline SVG rather than an image file so it inherits crispness at any
 * size, needs no network request, and can flip to a single colour where the
 * background does not allow the full mark.
 */

export type LogoProps = {
  className?: string;
  /** Renders in one colour (used on coloured or printed surfaces). */
  monochrome?: boolean;
  title?: string;
};

export function LogoMark({
  className,
  monochrome = false,
  title = "Nexus",
}: LogoProps) {
  const dark = monochrome ? "currentColor" : "var(--nx-logo-dark)";
  const green = monochrome ? "currentColor" : "var(--nx-logo-green)";

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <title>{title}</title>

      {/* Left downstroke of the N */}
      <rect x="8" y="14" width="11" height="36" rx="5.5" fill={dark} />

      {/* Diagonal: dark at the top, handing over to green at the foot */}
      <path
        d="M14.5 17.5 L44 47.5"
        stroke={dark}
        strokeWidth="11"
        strokeLinecap="round"
        opacity={monochrome ? 0.55 : 1}
      />

      {/* Right upstroke */}
      <rect x="45" y="14" width="11" height="36" rx="5.5" fill={green} />

      {/* Bars climbing the middle, cut out of the diagonal */}
      <g fill={monochrome ? "currentColor" : "var(--nx-logo-bar)"}>
        <rect x="24.5" y="38" width="4" height="9" rx="1.6" />
        <rect x="31" y="33" width="4" height="14" rx="1.6" />
        <rect x="37.5" y="28" width="4" height="19" rx="1.6" />
      </g>

      {/* Trend line riding the right stroke */}
      <g
        stroke={monochrome ? "currentColor" : "var(--nx-logo-line)"}
        fill={monochrome ? "currentColor" : "var(--nx-logo-line)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M46.5 36.5 L50.5 30 L54.5 23.5" fill="none" />
        <circle cx="46.5" cy="36.5" r="2.4" stroke="none" />
        <circle cx="50.5" cy="30" r="2.4" stroke="none" />
        <circle cx="54.5" cy="23.5" r="2.4" stroke="none" />
      </g>
    </svg>
  );
}

/** Mark plus wordmark, for headers and the auth screens. */
export function Logo({
  className,
  markClassName,
  textClassName,
  monochrome,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  monochrome?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("h-7 w-7", markClassName)} monochrome={monochrome} />
      <span
        className={cn(
          "text-[16px] font-semibold tracking-tight text-[var(--nx-text)]",
          textClassName,
        )}
      >
        Nexus
      </span>
    </span>
  );
}
