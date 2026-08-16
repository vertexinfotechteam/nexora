"use client";

import { useMemo, useState } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";
import type { AuditRow } from "@/lib/admin/platform";

/**
 * The audit trail.
 *
 * Read-only by construction — there is no edit or delete path to this data
 * anywhere in the application, because a log an operator can quietly alter is
 * not evidence of anything.
 */
const PAGE_SIZE = 25;

export function AuditLog({ rows }: { rows: AuditRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const actions = useMemo(
    () => [...new Set(rows.map((row) => row.action))].sort(),
    [rows],
  );
  const [action, setAction] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (action && row.action !== action) return false;
      if (!term) return true;
      return [row.action, row.resourceType, row.resourceId, row.userId, row.ipAddress]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [rows, search, action]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <ShieldAlert className="h-3.5 w-3.5" />
          Audit log
        </CardTitle>
        <span className="text-[10.5px] text-[var(--nx-text-faint)]">
          {filtered.length} of {rows.length}
        </span>
      </CardHeader>
      <CardBody className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--nx-border)] px-3 py-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--nx-text-faint)]" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search action, resource, user or IP"
              aria-label="Search audit log"
              className="h-8 w-full rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] pl-8 pr-2 text-[12px] outline-none focus:border-[var(--nx-accent)]"
            />
          </div>
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by action"
            className="h-8 rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2 text-[12px] outline-none focus:border-[var(--nx-accent)]"
          >
            <option value="">All actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {slice.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-[var(--nx-text-muted)]">
            {rows.length === 0
              ? "Nothing recorded yet. Sign-ins, uploads, analyses and admin actions appear here as they happen."
              : "No entry matches that filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-[var(--nx-text-muted)]">
                  {["When", "Action", "Target", "Actor", "IP"].map((header) => (
                    <th
                      key={header}
                      className="whitespace-nowrap border-b border-[var(--nx-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--nx-hover)]">
                    <td className="whitespace-nowrap border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-[var(--nx-text-muted)]">
                      {relativeTime(row.createdAt)}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5">
                      <span className="font-mono text-[10.5px]">{row.action}</span>
                      {row.metadata.platform_action ? (
                        <Badge tone="purple" className="ml-1.5">
                          admin
                        </Badge>
                      ) : null}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-[var(--nx-text-muted)]">
                      {row.resourceType ? (
                        <span className="font-mono text-[10.5px]">
                          {row.resourceType}
                          {row.resourceId ? `:${row.resourceId.slice(0, 8)}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                      {row.userId ? row.userId.slice(0, 8) : "system"}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                      {row.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--nx-border)] px-3 py-2 text-[11.5px]">
            <span className="text-[var(--nx-text-muted)]">
              Page {safePage} of {pages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={safePage === 1}
                className="h-7 rounded-md border border-[var(--nx-border)] px-2 disabled:opacity-40 enabled:hover:bg-[var(--nx-hover)]"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
                disabled={safePage === pages}
                className="h-7 rounded-md border border-[var(--nx-border)] px-2 disabled:opacity-40 enabled:hover:bg-[var(--nx-hover)]"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
