"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#pricing", label: "Pricing" },
  { href: "#resources", label: "Resources" },
  { href: "#team", label: "Team" },
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
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-[var(--nx-purple)] to-[var(--nx-accent)]">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-[14.5px] font-semibold tracking-tight">
            NEXORA AI
          </span>
        </Link>

        <ul className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="rounded-md px-2.5 py-1.5 text-[12.5px] text-[var(--nx-text-muted)] transition-colors hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle compact />

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
