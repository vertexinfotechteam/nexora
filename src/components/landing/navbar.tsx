"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#pricing", label: "Pricing" },
  { href: "#resources", label: "Resources" },
  { href: "#team", label: "Team" },
  { href: "#contact", label: "Contact" },
];

/**
 * Marketing navigation.
 *
 * Deliberately styled apart from the in-app top bar: it sits on a tinted
 * translucent surface with a brand-tinted border, so a visitor can tell at a
 * glance whether they are on the site or inside the product.
 */
export function LandingNavbar({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-200",
        scrolled
          ? "border-b border-[var(--nx-purple-soft)] bg-[var(--nx-surface)]/85 backdrop-blur-xl shadow-[var(--nx-shadow)]"
          : "border-b border-transparent bg-transparent",
      )}
    >
      {/* Hairline that fills as the page scrolls — a quiet progress read. */}
      <span
        aria-hidden
        className="nx-scan pointer-events-none absolute inset-x-0 bottom-0 h-px"
      />

      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="nx-brand group flex items-center gap-2.5">
          <span className="relative flex items-center justify-center">
            <LogoMark className="relative z-10 h-8 w-8 transition-transform duration-500 group-hover:rotate-[-6deg]" />
            <span
              aria-hidden
              className="absolute inset-0 -z-0 rounded-full bg-[var(--nx-logo-green)] opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-25"
            />
          </span>
          {/* Larger and wider than before: at 14.5px the wordmark read as a
              caption beside the mark rather than as the brand. */}
          <span className="text-[19px] font-bold leading-none tracking-[-0.02em]">
            Nexus
          </span>
        </Link>

        <ul className="ml-7 hidden items-center gap-0.5 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              {/* The underline grows from the centre on hover, so the row has
                  a rhythm instead of four identical grey words. */}
              <a
                href={link.href}
                className="nx-navlink relative rounded-md px-3 py-2 text-[13px] font-medium text-[var(--nx-text-muted)] transition-colors hover:text-[var(--nx-text)]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5">

          {signedIn ? (
            <Button asChild size="sm" variant="primary">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="primary">
                <Link href="/signup">Create account free</Link>
              </Button>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-md text-[var(--nx-text-muted)] hover:bg-[var(--nx-elevated)] md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {open ? (
        <div className="border-t border-[var(--nx-border)] bg-[var(--nx-surface)] px-4 py-2 md:hidden">
          <ul className="space-y-0.5">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-2 text-[13px] text-[var(--nx-text-muted)] hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)]"
                >
                  {link.label}
                </a>
              </li>
            ))}
            {!signedIn ? (
              <li>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-2 text-[13px] text-[var(--nx-text-muted)] hover:bg-[var(--nx-elevated)]"
                >
                  Sign in
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
