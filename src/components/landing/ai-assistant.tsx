"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "How many free credits do I get?",
  "Can I trust the numbers?",
  "What file formats can I upload?",
  "Is my data private?",
];

const GREETING: Message = {
  role: "assistant",
  text: "Hello. I'm the Nexus assistant — I'm here around the clock. Ask me about credits, security, supported files, exports, or how the analysis actually works.",
};

/**
 * Always-available product assistant.
 *
 * Answers come from a curated knowledge base on the server, so it responds
 * whether or not an AI provider is configured. That is what lets it be
 * genuinely 24/7 rather than "24/7 until the API key runs out".
 */
export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * Keeps the newest message in view by scrolling the list, not the page.
   *
   * scrollIntoView() was doing this before, and it does not stay inside the
   * element it is called on: it scrolls every scrollable ancestor, the
   * document included, and adjusts horizontally as well as vertically. On a
   * phone that read as the page lurching up and down and sliding sideways the
   * moment the assistant opened, which made the site feel broken while the
   * panel was up. Setting scrollTop moves this one box and nothing else.
   */
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  /*
   * The field is focused for a pointer, never for a touch.
   *
   * Focusing an input inside a fixed panel makes a mobile browser scroll the
   * document to reach it and raise the keyboard over half the screen — before
   * the reader has decided to type anything. preventScroll stops the jump on
   * desktop; the coarse-pointer check stops the keyboard on a phone.
   */
  useEffect(() => {
    if (!open) return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (coarse) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    setMessages((previous) => [...previous, { role: "user", text: question }]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const data = await response.json();
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text:
            data.answer ??
            data.error ??
            "Something went wrong on my side. Please try again.",
        },
      ]);
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: "I could not reach the server just then. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open the Nexus assistant"}
        aria-expanded={open}
        className={cn(
          "nx-orb group fixed bottom-4 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-300 hover:scale-105",
          "bg-[radial-gradient(circle_at_30%_25%,var(--nx-accent)_0%,var(--nx-purple)_55%,var(--nx-purple-active)_100%)]",
        )}
      >
        {open ? (
          <X className="h-5 w-5 text-white" />
        ) : (
          <>
            {/*
              A rising bar chart with a reading tracing over it, rather than a
              speech bubble. The generic bubble said "chat widget" — the thing
              every site has — when what sits behind it is an analyst. The
              orbit ring and the travelling point are what make it read as
              working rather than waiting.
            */}
            <span
              aria-hidden
              className="nx-orbit absolute inset-0 rounded-full border border-white/25"
            />
            <svg viewBox="0 0 24 24" className="relative h-6 w-6" fill="none">
              <rect x="4" y="13" width="3.2" height="7" rx="1.2" fill="white" opacity="0.55" />
              <rect x="10.4" y="9.5" width="3.2" height="10.5" rx="1.2" fill="white" opacity="0.78" />
              <rect x="16.8" y="5.5" width="3.2" height="14.5" rx="1.2" fill="white" />
              <path
                d="M5.6 11.2 L12 8 L18.4 3.6"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="nx-spark"
              />
              <circle cx="18.4" cy="3.6" r="1.9" fill="white" />
            </svg>
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute h-full w-full animate-ping rounded-full bg-[var(--nx-success)] opacity-75" />
              <span className="relative h-3 w-3 rounded-full border-2 border-[var(--nx-bg)] bg-[var(--nx-success)]" />
            </span>
          </>
        )}
      </button>

      {/* Panel */}
      {open ? (
        <section
          aria-label="Nexus assistant"
          /*
           * Anchored to both edges rather than sized from 100vw.
           *
           * calc(100vw - 2rem) is only as good as vw is, and on a phone vw
           * counts the scrollbar and does not shrink when the visual viewport
           * does — so a panel sized that way can sit wider than the screen it
           * is on and hang off the right edge. Pinning left and right and
           * capping the width leaves the browser to do the arithmetic against
           * the viewport it actually has.
           */
          className="nx-enter fixed bottom-20 left-4 right-4 z-[60] ml-auto flex h-[min(520px,calc(100vh-7rem))] max-w-[380px] flex-col overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] shadow-[var(--nx-shadow-lg)]"
        >
          <header className="flex items-center gap-2.5 border-b border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--nx-purple)] to-[var(--nx-accent)]">
              <Bot className="h-4 w-4 text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold leading-tight">
                Nexus Assistant
              </p>
              <p className="flex items-center gap-1 text-[10.5px] text-[var(--nx-text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--nx-success)]" />
                Online · answers 24/7
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="ml-auto text-[var(--nx-text-faint)] hover:text-[var(--nx-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <p
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed",
                    message.role === "user"
                      ? "rounded-br-sm bg-[var(--nx-purple)] text-[var(--nx-purple-on)]"
                      : "rounded-bl-sm bg-[var(--nx-elevated)] text-[var(--nx-text)]",
                  )}
                >
                  {message.text}
                </p>
              </div>
            ))}

            {busy ? (
              <div className="flex justify-start">
                <p className="flex items-center gap-1.5 rounded-xl rounded-bl-sm bg-[var(--nx-elevated)] px-3 py-2 text-[12px] text-[var(--nx-text-muted)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking…
                </p>
              </div>
            ) : null}

            {messages.length === 1 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border border-[var(--nx-border)] px-2.5 py-1 text-[11px] text-[var(--nx-text-muted)] transition-colors hover:border-[var(--nx-purple)] hover:text-[var(--nx-text)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}

          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
            className="flex items-center gap-1.5 border-t border-[var(--nx-border)] bg-[var(--nx-surface)] p-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about Nexus…"
              maxLength={500}
              className="h-8 flex-1 rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2.5 text-[12px] text-[var(--nx-text)] outline-none placeholder:text-[var(--nx-text-faint)] focus:border-[var(--nx-purple)]"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--nx-purple)] text-[var(--nx-purple-on)] transition-colors hover:bg-[var(--nx-purple-hover)] disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
