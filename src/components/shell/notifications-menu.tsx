"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlertTriangle, Bell, CheckCircle2, Info, XCircle } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { markAllReadAction } from "@/app/(app)/notifications-actions";
import type { AppNotification, NotificationLevel } from "@/lib/notifications";

/**
 * The bell in the top bar.
 *
 * It used to be a button with no click handler at all — it looked live and did
 * nothing. It now opens the user's real notifications.
 */

const LEVEL_ICON: Record<NotificationLevel, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const LEVEL_COLOR: Record<NotificationLevel, string> = {
  info: "text-[var(--nx-text-dim)]",
  success: "text-[var(--nx-success)]",
  warning: "text-[var(--nx-warning)]",
  error: "text-[var(--nx-error)]",
};

export function NotificationsMenu({ initial }: { initial: AppNotification[] }) {
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();

  const unread = items.filter((item) => !item.read_at).length;

  const openChange = (open: boolean) => {
    if (!open || unread === 0) return;
    const now = new Date().toISOString();
    setItems((rows) => rows.map((row) => ({ ...row, read_at: row.read_at ?? now })));
    startTransition(() => {
      void markAllReadAction();
    });
  };

  return (
    <DropdownMenu.Root onOpenChange={openChange}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title={unread > 0 ? `${unread} unread` : "Notifications"}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex h-7 w-7 items-center justify-center rounded-md text-[var(--nx-text-dim)] transition-colors hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)]"
        >
          <Bell className="h-[15px] w-[15px]" />
          {unread > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--nx-error)] px-[3px] text-[9px] font-semibold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[320px] overflow-hidden rounded-md border border-[var(--nx-border)] bg-[var(--nx-card)] shadow-xl"
        >
          <div className="border-b border-[var(--nx-border)] px-3 py-2">
            <p className="text-[12.5px] font-medium">Notifications</p>
          </div>

          {items.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[12px] text-[var(--nx-text-muted)]">
                Nothing yet.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--nx-text-faint)]">
                When an analysis finishes or something unusual turns up in your
                data, it will appear here.
              </p>
            </div>
          ) : (
            <ul className="max-h-[340px] overflow-y-auto">
              {items.map((item) => {
                const Icon = LEVEL_ICON[item.level] ?? Info;
                const row = (
                  <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--nx-hover)]">
                    <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${LEVEL_COLOR[item.level]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium leading-snug">
                        {item.title}
                      </p>
                      {item.body ? (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--nx-text-muted)]">
                          {item.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-[var(--nx-text-faint)]">
                        {relativeTime(item.created_at)}
                      </p>
                    </div>
                    {!item.read_at ? (
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--nx-accent)]" />
                    ) : null}
                  </div>
                );

                return (
                  <li key={item.id} className="border-b border-[var(--nx-border-subtle)] last:border-0">
                    {item.link ? (
                      <Link href={item.link} className="block">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
