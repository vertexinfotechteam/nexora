"use client";

import { useState, useTransition } from "react";
import { Mail, MessageSquare } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";
import { updateContactStatusAction } from "@/app/(app)/admin/actions";
import type { ContactMessage, ContactStatus } from "@/lib/contact";

/**
 * What visitors wrote through the landing page contact form.
 *
 * Rendered verbatim as text — never as HTML — because every word of it is
 * attacker-controlled input from an unauthenticated stranger.
 */

const STATUS_TONE: Record<ContactStatus, "success" | "warning" | "neutral"> = {
  new: "warning",
  read: "neutral",
  replied: "success",
  archived: "neutral",
};

const NEXT_STATUS: Record<ContactStatus, ContactStatus> = {
  new: "read",
  read: "replied",
  replied: "archived",
  archived: "new",
};

export function ContactMessages({ initial }: { initial: ContactMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unread = messages.filter((message) => message.status === "new").length;

  const cycleStatus = (message: ContactMessage) => {
    const next = NEXT_STATUS[message.status];
    // Optimistic: the panel is a queue, and waiting on a round trip to see a
    // chip change makes triaging a list feel broken.
    setMessages((rows) =>
      rows.map((row) => (row.id === message.id ? { ...row, status: next } : row)),
    );
    startTransition(async () => {
      const ok = await updateContactStatusAction(message.id, next);
      if (!ok) {
        setMessages((rows) =>
          rows.map((row) =>
            row.id === message.id ? { ...row, status: message.status } : row,
          ),
        );
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <MessageSquare className="h-3.5 w-3.5" />
          Questions from visitors
        </CardTitle>
        <div className="flex items-center gap-2">
          {unread > 0 ? <Badge tone="warning">{unread} new</Badge> : null}
          <span className="text-[10.5px] text-[var(--nx-text-faint)]">
            {messages.length} total
          </span>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {messages.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-[var(--nx-text-muted)]">
            Nobody has written in yet. Messages sent from the contact form on
            the landing page appear here.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--nx-border-subtle)]">
            {messages.map((message) => {
              const open = openId === message.id;
              return (
                <li key={message.id} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : message.id)}
                      aria-expanded={open}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
                        <span className="truncate">{message.subject}</span>
                        {message.status === "new" ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--nx-warning)]" />
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--nx-text-muted)]">
                        {message.name} · {message.email} ·{" "}
                        {relativeTime(message.created_at)}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => cycleStatus(message)}
                      disabled={pending}
                      title="Change status"
                      className="shrink-0 disabled:opacity-50"
                    >
                      <Badge tone={STATUS_TONE[message.status]}>
                        {message.status}
                      </Badge>
                    </button>
                  </div>

                  {open ? (
                    <div className="mt-2 rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] p-3">
                      {/* whitespace-pre-wrap keeps the visitor's line breaks;
                          React escapes the content, so markup in it is inert. */}
                      <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--nx-text)]">
                        {message.message}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[10.5px] text-[var(--nx-text-faint)]">
                        <a
                          href={`mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(
                            `Re: ${message.subject}`,
                          )}`}
                          className="inline-flex items-center gap-1 text-[var(--nx-accent)] hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          Reply by email
                        </a>
                        {message.user_id ? <span>Signed-in user</span> : <span>Visitor</span>}
                        {message.source_path ? (
                          <span className="truncate">from {message.source_path}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
