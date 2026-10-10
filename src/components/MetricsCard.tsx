"use client";

import { useQuery } from "@tanstack/react-query";
import type { Summary } from "@/lib/metrics";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);

/**
 * The last 7 days of the pipeline funnel, straight from /api/metrics.
 * Shows a plain "no data yet" state instead of a row of zeros.
 */
export function MetricsCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["metrics", 7],
    queryFn: async () => {
      const res = await fetch("/api/metrics?days=7");
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as Summary;
    },
    retry: false,
  });

  if (isLoading) return <p className="px-4 py-3 text-xs text-lumi-muted">Loading…</p>;
  if (isError || !data) {
    return <p className="px-4 py-3 text-xs text-lumi-muted">Sign in to see your numbers.</p>;
  }
  if (!data.hasData) {
    return (
      <p className="px-4 py-3 text-xs text-lumi-muted">
        No activity recorded in the last 7 days. Numbers appear after the next inbox sweep.
      </p>
    );
  }

  const t = data.totals;
  const cells: [string, string, string][] = [
    ["Emails scanned", String(t.emailsScanned), "new mail Lumi looked at"],
    ["Sent to the model", String(t.emailsToModel), `${pct(data.modelRate)} of scanned`],
    ["Events found", String(t.eventsCreated), "cards shown to you"],
    ["Events accepted", String(data.netAccepted), `${pct(data.acceptRate)} of decided`],
    ["Time saved", `${Math.round(data.minutesSavedPerWeek)} min/wk`, "estimate — see docs/METRICS.md"],
    ["Model spend", `$${t.llmUsd.toFixed(2)}`, "last 7 days"],
  ];

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-lumi-border">
      {cells.map(([label, value, sub]) => (
        <div key={label} className="bg-lumi-surface px-4 py-3">
          <dt className="text-xs text-lumi-muted">{label}</dt>
          <dd className="text-lg text-lumi-text tabular-nums">{value}</dd>
          <dd className="text-[11px] text-lumi-subtle">{sub}</dd>
        </div>
      ))}
    </dl>
  );
}
