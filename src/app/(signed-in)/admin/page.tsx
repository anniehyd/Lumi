import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadAdminOverview, sampleOverview, CHART_DAYS, WINDOW_DAYS, type AdminOverview } from "@/lib/admin";
import { Nav } from "@/components/Nav";
import { AdminUsers } from "@/components/AdminUsers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lumi · Operator view" };

const usd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

/**
 * Every account on this deployment, for the person running it. Only addresses
 * in ADMIN_EMAILS get in; everyone else gets the same 404 as a page that does
 * not exist, so the route does not advertise itself. In demo mode there is no
 * sign-in and no database, and the page shows invented accounts instead.
 */
export default async function AdminPage() {
  let data: AdminOverview;
  if (process.env.GOOGLE_CLIENT_ID) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) notFound();
    data = await loadAdminOverview();
  } else {
    data = sampleOverview();
  }

  const { totals: t, limits } = data;
  const tiles: [string, string, string][] = [
    [
      "People",
      String(t.users),
      limits.maxUsers ? `of ${limits.maxUsers} places · ${t.onboarded} finished setup` : `${t.onboarded} finished setup`,
    ],
    ["Here this week", String(t.active7d), t.paused ? `${t.paused} paused for being away` : "nobody paused"],
    [`Model spend, ${WINDOW_DAYS} days`, usd(t.usd30d), `${usd(t.usdToday)} today · ${usd(t.usd7d)} this week`],
    [
      "At this week's pace",
      `${usd(t.usdMonthProjected)}/mo`,
      t.usdPerPayingUser === null ? "no model calls yet" : `${usd(t.usdPerPayingUser)} per person with mail`,
    ],
  ];

  return (
    <div className="min-h-screen flex flex-col bg-lumi-bg">
      <Nav />
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 sm:px-10 pt-10 sm:pt-14 pb-24">
        <div className="flex flex-col gap-4 mb-10">
          <p className="inline-flex flex-wrap items-center gap-2.5 text-sm text-lumi-muted">
            <span className="w-2 h-2 rounded-full bg-lumi-accent" />
            Operator view. Counts and timestamps only; nobody&rsquo;s mail is shown here.
            {data.sample && (
              <span className="rounded-full bg-lumi-mark px-2.5 py-0.5 text-xs font-semibold text-lumi-text">
                Sample accounts
              </span>
            )}
          </p>
          <h1 className="font-serif text-[40px] sm:text-[56px] font-normal leading-[0.98] tracking-[-0.03em] text-lumi-text">
            {t.users} {t.users === 1 ? "person" : "people"},{" "}
            <span className="italic font-medium">{usd(t.usd30d)}</span> in {WINDOW_DAYS} days.
          </h1>
        </div>

        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map(([label, value, sub]) => (
            <div key={label} className="rounded-2xl bg-lumi-surface px-5 py-5">
              <dt className="text-xs text-lumi-muted">{label}</dt>
              <dd className="font-serif text-[34px] font-light leading-none text-lumi-text tabular-nums mt-2">
                {value}
              </dd>
              <dd className="text-xs text-lumi-subtle mt-2 leading-relaxed">{sub}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-x-12 gap-y-10 mt-12">
          <section>
            <SectionTitle>Room left</SectionTitle>
            <Meter
              label="Sign-ups"
              used={t.users}
              cap={limits.maxUsers}
              note={
                limits.maxUsers
                  ? "Set by LUMI_MAX_USERS. Past it, new people see “the beta is full”."
                  : "No cap. Set LUMI_MAX_USERS to put a ceiling on the bill."
              }
            />
            <Meter
              label="Gmail connections"
              used={t.gmail}
              cap={limits.googleUnverifiedCap}
              note="Google allows 100 until Lumi passes its review. Forwarding does not count against this."
            />
            <p className="mt-5 text-sm text-lumi-muted leading-relaxed">
              {t.forwarding} forwarding · {t.handshake} with Handshake · {t.noSource} signed in but connected
              nothing.
            </p>
          </section>

          <section>
            <SectionTitle>Model spend, last {CHART_DAYS} days</SectionTitle>
            <SpendChart daily={data.daily} />
          </section>
        </div>

        <section className="mt-14">
          <SectionTitle>Everyone</SectionTitle>
          <AdminUsers users={data.users} dailyBudgetUsd={limits.dailyBudgetUsd} generatedAt={data.generatedAt} />
        </section>

        <p className="mt-10 border-t border-lumi-border pt-5 text-xs text-lumi-subtle leading-relaxed">
          Limits in force:{" "}
          {limits.dailyBudgetUsd === null
            ? "no daily model budget"
            : `${usd(limits.dailyBudgetUsd)} of model calls per person per day`}
          {" · "}
          {limits.pauseAfterDays === null
            ? "sweeps never pause"
            : `sweeps pause after ${limits.pauseAfterDays} days away`}
          {" · "}
          {limits.maxUsers === null ? "sign-ups uncapped" : `${limits.maxUsers} accounts at most`}. Spend is the
          model only; hosting is a flat line on the Fly bill.
        </p>
      </main>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-[26px] font-medium leading-[1.1] tracking-[-0.02em] text-lumi-text mb-5">
      {children}
    </h2>
  );
}

function Meter({ label, used, cap, note }: { label: string; used: number; cap: number | null; note: string }) {
  const share = cap ? Math.min(used / cap, 1) : 0;
  const tight = cap !== null && share >= 0.8;
  return (
    <div className="py-4 border-t border-lumi-border first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[15px] font-semibold text-lumi-text">{label}</span>
        <span className="text-sm tabular-nums text-lumi-muted">
          <span className={`font-semibold ${tight ? "text-lumi-rose" : "text-lumi-text"}`}>{used}</span>
          {cap !== null && ` of ${cap}`}
        </span>
      </div>
      {cap !== null && (
        <div
          className="mt-2.5 h-2 rounded-full bg-lumi-surface overflow-hidden"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={Math.min(used, cap)}
        >
          <div
            className={`h-full rounded-full ${tight ? "bg-lumi-rose" : "bg-lumi-accent"}`}
            style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-lumi-subtle leading-relaxed">{note}</p>
    </div>
  );
}

function SpendChart({ daily }: { daily: AdminOverview["daily"] }) {
  const max = Math.max(...daily.map((d) => d.usd), 0);
  if (max === 0) {
    return <p className="text-sm text-lumi-muted">No model calls in this window yet.</p>;
  }
  const label = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div>
      <div className="flex items-end gap-1.5 h-36" role="img" aria-label={`Daily model spend, peak ${usd(max)}`}>
        {daily.map((d) => (
          <div
            key={d.day}
            className="group relative flex-1 h-full flex flex-col justify-end"
            title={`${label(d.day)}: ${usd(d.usd)}, ${d.emailsToModel} model calls${d.signups ? `, ${d.signups} joined` : ""}`}
          >
            {d.signups > 0 && (
              <span className="mx-auto mb-1 text-[10px] font-semibold leading-none text-lumi-muted tabular-nums">
                +{d.signups}
              </span>
            )}
            <div
              className="w-full rounded-t-[4px] bg-lumi-accent/85 group-hover:bg-lumi-accent transition-colors"
              style={{ height: `${Math.max((d.usd / max) * 82, d.usd > 0 ? 2 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t border-lumi-border pt-2 text-xs text-lumi-subtle tabular-nums">
        <span>{label(daily[0].day)}</span>
        <span>
          peak {usd(max)} a day (UTC) · <span className="font-semibold text-lumi-muted">+n</span> joined
        </span>
        <span>{label(daily[daily.length - 1].day)}</span>
      </div>
    </div>
  );
}
