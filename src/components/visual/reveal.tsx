"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveals its children as they scroll into view.
 *
 * Uses IntersectionObserver rather than a scroll listener, so the browser does
 * the work off the main thread and there is no per-frame cost. Each element is
 * unobserved once it has appeared — the animation is an entrance, not a state,
 * and re-running it on every scroll past would be noise.
 *
 * Under `prefers-reduced-motion` the content is shown immediately with no
 * transition; nothing here is required to read the page.
 */

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Stagger in milliseconds, for sequencing a group. */
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.classList.add("is-visible");
      return;
    }

    // No IntersectionObserver (old browser, unusual embedding): show it.
    if (typeof IntersectionObserver !== "function") {
      element.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.style.transitionDelay = `${delay}ms`;
          target.classList.add("is-visible");
          observer.unobserve(target);
        }
      },
      // Start slightly before the element reaches the viewport so the motion
      // finishes about when the reader's eye arrives.
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );

    observer.observe(element);

    /*
     * Fail-safe.
     *
     * This element starts at opacity 0, so if the observer never fires the
     * content would be invisible for good. That can happen in environments
     * that do not composite normally — embedded webviews, some headless
     * browsers, a background tab that is never brought forward. A decorative
     * entrance must never be able to hide content, so it is force-shown after
     * a short grace period regardless.
     */
    const failSafe = window.setTimeout(() => {
      // Snap rather than animate: if the environment is not producing frames,
      // the transition will not run either, so the class alone would leave the
      // element stuck at opacity 0. Writing the final values inline with the
      // transition disabled guarantees the content is on screen.
      element.classList.add("is-visible");
      element.style.transition = "none";
      element.style.opacity = "1";
      element.style.transform = "none";
      observer.disconnect();
    }, 1600);

    return () => {
      window.clearTimeout(failSafe);
      observer.disconnect();
    };
  }, [delay]);

  return (
    <Tag ref={ref} className={cn("nx-reveal", className)}>
      {children}
    </Tag>
  );
}
