"use client";

import { useMemo, useState } from "react";
import type { AdminUser, UserState } from "@/lib/admin";

const STATE: Record<UserState, { label: string; dot: string; hint: string }> = {
  active: { label: "Running", dot: "bg-lumi-green", hint: "Mail is arriving and being read on schedule." },
  stale: { label: "Not scanning", dot: "bg-lumi-rose", hint: "Gmail is connected but the last pull is over a day old. The grant may have been revoked." },
  paused: { label: "Paused", dot: "bg-lumi-mark", hint: "Away too long; sweeps resume when they open Lumi." },
  no_source: { label: "Nothing connected", dot: "bg-lumi-border", hint: "Signed in, but no Gmail, forwarding or Handshake." },
};

const FILTERS: ("all" | UserState)[] = ["all", "active", "stale", "paused", "no_source"];

const usd = (n: number) => (n === 0 ? "—" : n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The account list: search, filter by state, most expensive first. Rendered
 * as a table from md up and as stacked rows on a phone, from the same data.
 */
export function AdminUsers({
  users,
  dailyBudgetUsd,
  generatedAt,
}: {
  users: AdminUser[];
  dailyBudgetUsd: number | null;
  /** When the server read the data; every "x ago" is measured from it. */
  generatedAt: string;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | UserState>("all");
  // The server's clock, not the browser's: the same text on both sides of
  // hydration, and every "x ago" on the page agrees.
  const now = new Date(generatedAt).getTime();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: users.length };
    for (const u of users) c[u.state] = (c[u.state] ?? 0) + 1;
    return c;
  }, [users]);

  const shown = users.filter((u) => {
    if (filter !== "all" && u.state !== filter) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(needle);
  });

  if (users.length === 0) {
    return <p className="text-sm text-lumi-muted">Nobody has signed in yet.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by state">
          {FILTERS.filter((f) => f === "all" || counts[f]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                filter === f
                  ? "bg-lumi-text text-white"
                  : "bg-lumi-surface text-lumi-muted hover:bg-lumi-surface-hover hover:text-lumi-text"
              }`}
            >
              {f === "all" ? "Everyone" : STATE[f].label} <span className="tabular-nums opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find by name or email"
          aria-label="Find by name or email"
          className="w-full sm:w-64 rounded-full border border-lumi-border bg-lumi-bg px-4 py-2 text-sm text-lumi-text placeholder:text-lumi-subtle focus:outline-none focus:border-lumi-text"
        />
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-sm text-lumi-muted">Nobody matches.</p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-lumi-subtle border-b border-lumi-border">
                  <th className="py-2.5 pr-4 font-medium">Person</th>
                  <th className="py-2.5 pr-4 font-medium">Reads from</th>
                  <th className="py-2.5 pr-4 font-medium">State</th>
                  <th className="py-2.5 pr-4 font-medium">Last here</th>
                  <th className="py-2.5 pr-4 font-medium">Last scan</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Waiting</th>
                  <th className="py-2.5 pr-4 font-medium text-right" title="Accepted of cards shown, last 30 days">
                    Accepted
                  </th>
                  <th className="py-2.5 pr-4 font-medium text-right" title="Model calls, last 30 days">
                    Calls
                  </th>
                  <th className="py-2.5 font-medium text-right" title="Model spend, last 30 days">
                    Spend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lumi-border">
                {shown.map((u) => (
                  <tr key={u.id} className="align-middle hover:bg-lumi-surface/60">
                    <td className="py-3 pr-4">
                      <Person u={u} now={now} />
                    </td>
                    <td className="py-3 pr-4">
                      <Sources u={u} />
                    </td>
                    <td className="py-3 pr-4">
                      <StateTag state={u.state} />
                    </td>
                    <td className="py-3 pr-4 text-lumi-muted whitespace-nowrap">{ago(u.lastSeenAt, now)}</td>
                    <td className="py-3 pr-4 text-lumi-muted whitespace-nowrap">
                      {u.gmail ? ago(u.lastScanAt, now) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-lumi-text">{u.pending || "—"}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-lumi-muted">
                      {u.eventsCreated ? `${u.eventsAccepted} of ${u.eventsCreated}` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-lumi-muted">{u.emailsToModel || "—"}</td>
                    <td className="py-3 text-right tabular-nums font-semibold text-lumi-text whitespace-nowrap">
                      {usd(u.usd)}
                      <OverBudget u={u} cap={dailyBudgetUsd} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden divide-y divide-lumi-border border-t border-lumi-border">
            {shown.map((u) => (
              <li key={u.id} className="py-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3">
                  <Person u={u} now={now} />
                  <span className="text-sm font-semibold tabular-nums text-lumi-text whitespace-nowrap">
                    {usd(u.usd)}
                    <OverBudget u={u} cap={dailyBudgetUsd} />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StateTag state={u.state} />
                  <Sources u={u} />
                </div>
                <p className="text-xs text-lumi-muted">
                  Here {ago(u.lastSeenAt, now)}
                  {u.gmail && ` · scanned ${ago(u.lastScanAt, now)}`}
                  {u.pending > 0 && ` · ${u.pending} waiting`}
                  {u.eventsCreated > 0 && ` · accepted ${u.eventsAccepted} of ${u.eventsCreated}`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Person({ u, now }: { u: AdminUser; now: number }) {
  const display = u.name ?? u.email ?? "Unnamed";
  return (
    <div className="flex items-center gap-3 min-w-0">
      {u.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.image} alt="" className="w-8 h-8 rounded-full border border-lumi-border shrink-0" />
      ) : (
        <span className="w-8 h-8 shrink-0 rounded-full bg-lumi-surface border border-lumi-border flex items-center justify-center text-xs font-semibold text-lumi-muted">
          {display.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <div className="font-semibold text-lumi-text truncate">
          {display}
          {!u.onboarded && <span className="ml-2 text-xs font-medium text-lumi-subtle">setup unfinished</span>}
        </div>
        <div className="text-xs text-lumi-subtle truncate">
          {u.email} · joined {ago(u.createdAt, now)}
        </div>
      </div>
    </div>
  );
}

function Sources({ u }: { u: AdminUser }) {
  const list = [u.gmail && "Gmail", u.forwarding && "Forwarding", u.handshake && "Handshake"].filter(Boolean);
  if (list.length === 0) return <span className="text-lumi-subtle">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((s) => (
        <span key={String(s)} className="rounded-full border border-lumi-border px-2 py-0.5 text-xs text-lumi-muted">
          {s}
        </span>
      ))}
    </span>
  );
}

function StateTag({ state }: { state: UserState }) {
  const s = STATE[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-lumi-text whitespace-nowrap" title={s.hint}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function OverBudget({ u, cap }: { u: AdminUser; cap: number | null }) {
  if (cap === null || u.usdToday < cap) return null;
  return (
    <span className="block text-[11px] font-medium text-lumi-rose" title="Today's model budget is used up; no more model calls until tomorrow (UTC).">
      at today&rsquo;s cap
    </span>
  );
}
