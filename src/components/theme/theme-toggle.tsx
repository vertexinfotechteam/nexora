"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_STORAGE_KEY } from "./theme-script";

export type Theme = "light" | "dark" | "system";

function resolve(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(theme: Theme) {
  const resolved = resolve(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Light / dark / system switch.
 *
 * Light is the default. The choice is stored locally and re-applied before
 * paint by ThemeScript, so a reload never flashes the wrong theme.
 */
export function ThemeToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ?? "light";
    setTheme(stored);
    setMounted(true);
  }, []);

  // Follow the OS while "system" is selected.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    setTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    apply(next);
  };

  const options: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ];

  if (compact) {
    // Single button that flips between light and dark.
    const isDark = mounted && resolve(theme) === "dark";
    return (
      <button
        type="button"
        onClick={() => choose(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md text-[var(--nx-text-dim)] transition-colors hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)]",
          className,
        )}
      >
        {/* Render nothing theme-specific until mounted, or SSR and client disagree. */}
        {!mounted ? (
          <Sun className="h-[15px] w-[15px] opacity-0" />
        ) : isDark ? (
          <Moon className="h-[15px] w-[15px]" />
        ) : (
          <Sun className="h-[15px] w-[15px]" />
        )}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => choose(option.value)}
            className={cn(
              "flex h-6 w-7 items-center justify-center rounded transition-colors",
              active
                ? "bg-[var(--nx-card)] text-[var(--nx-text)] shadow-sm"
                : "text-[var(--nx-text-faint)] hover:text-[var(--nx-text-muted)]",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
