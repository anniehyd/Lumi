"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Shield,
  Check,
  LogOut,
  Rss,
  Copy,
  ExternalLink,
  Compass,
  BarChart3,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import { ProfileEditor } from "@/components/ProfileEditor";
import { MetricsCard } from "@/components/MetricsCard";

/**
 * Settings. Every control here reads from or writes to the server for the
 * signed-in user — nothing is decorative. Earlier versions showed toggles,
 * a keyword list, a calendar picker and a timezone that were never saved,
 * plus one hardcoded inbox address; a second user would have seen someone
 * else's email and buttons that did nothing.
 */
export default function SettingsPage() {
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <h1 className="font-serif text-3xl text-lumi-text mb-1">Settings</h1>
        <p className="text-sm text-lumi-muted mb-10">
          Where Lumi reads from, what it ranks against, and where it writes.
        </p>

        <Section icon={<Shield className="w-4 h-4" />} title="Account">
          <AccountRow />
        </Section>

        <Section icon={<Mail className="w-4 h-4" />} title="Email source">
          <InboxRow signedIn={signedIn} email={session?.user?.email ?? null} />
        </Section>

        <Section icon={<Link2 className="w-4 h-4" />} title="Handshake">
          <HandshakeRow signedIn={signedIn} />
        </Section>

        <Section icon={<Compass className="w-4 h-4" />} title="What matters to you">
          {signedIn ? (
            <ProfileEditor />
          ) : (
            <p className="px-5 py-4 text-xs text-lumi-muted">Sign in to set your interests.</p>
          )}
        </Section>

        <Section icon={<BarChart3 className="w-4 h-4" />} title="Your numbers — last 7 days">
          <MetricsCard />
        </Section>

        <Section icon={<Rss className="w-4 h-4" />} title="Sync to Apple Calendar">
          <FeedSection signedIn={signedIn} />
        </Section>
      </main>
    </div>
  );
}

/* ─── Account ─── */

function AccountRow() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const image = session?.user?.image;
  const initial = (email ?? "D").charAt(0).toUpperCase();
  return (
    <div className="px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="w-10 h-10 rounded-full border border-lumi-border" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-lumi-bg border border-lumi-border flex items-center justify-center text-sm font-medium">
            {initial}
          </div>
        )}
        <div>
          <div className="text-sm text-lumi-text">{email ?? "Demo mode"}</div>
          <div className="text-xs text-lumi-muted">
            {session ? "Connected via Google" : "Sample data only — sign in from the landing page"}
          </div>
        </div>
      </div>
      {session && (
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-1.5 text-xs text-lumi-muted hover:text-lumi-rose transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      )}
    </div>
  );
}

/* ─── Inbox + Scan now ─── */

type ScanResult = {
  fetched: number;
  newEmails: number;
  sentToModel: number;
  eventsCreated: number;
  failed: number;
  handshake: { configured: boolean; fetched: number; eventsCreated: number };
};

function InboxRow({ signedIn, email }: { signedIn: boolean; email: string | null }) {
  const qc = useQueryClient();
  const scan = useMutation({
    mutationFn: async (): Promise<ScanResult> => {
      const res = await fetch("/api/ingest/poll", { method: "POST" });
      if (!res.ok) throw new Error(`scan failed (${res.status})`);
      return (await res.json()) as ScanResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["sync-status"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
    },
  });

  return (
    <>
      <Row
        label="Connected inbox"
        sub="Swept twice a day, 1 PM and 7 PM New York. Inbox tab only — Promotions, Social, archived and sent mail are never read."
      >
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-1.5 h-1.5 rounded-full ${signedIn ? "bg-lumi-green" : "bg-lumi-border"}`} />
          <span className="text-lumi-text">{email ?? "Not connected"}</span>
        </div>
      </Row>
      <Row label="Scan now" sub="Pull new mail and your Handshake feed without waiting for the next sweep.">
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={() => scan.mutate()}
            disabled={!signedIn || scan.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lumi-border px-3 py-1.5 text-xs font-medium text-lumi-muted hover:text-lumi-text hover:border-lumi-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {scan.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {scan.isPending ? "Scanning…" : "Scan now"}
          </button>
          {scan.isSuccess && (
            <span className="text-[11px] text-lumi-muted">
              {scan.data.newEmails} new email{scan.data.newEmails === 1 ? "" : "s"},{" "}
              {scan.data.eventsCreated + scan.data.handshake.eventsCreated} new event
              {scan.data.eventsCreated + scan.data.handshake.eventsCreated === 1 ? "" : "s"}
            </span>
          )}
          {scan.isError && <span className="text-[11px] text-lumi-rose">Scan failed. Try again?</span>}
          {!signedIn && <span className="text-[11px] text-lumi-subtle">Sign in to scan</span>}
        </div>
      </Row>
    </>
  );
}

/* ─── Handshake feed ─── */

type HandshakeStatus = { connected: boolean; host: string | null; fromEnv: boolean };

function HandshakeRow({ signedIn }: { signedIn: boolean }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["handshake"],
    queryFn: async () => {
      const res = await fetch("/api/sources/handshake");
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as HandshakeStatus;
    },
    enabled: signedIn,
    retry: false,
  });

  const connect = useMutation({
    mutationFn: async (feedUrl: string) => {
      const res = await fetch("/api/sources/handshake", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedUrl }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body;
    },
    onSuccess: () => {
      setUrl("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["handshake"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not connect that feed."),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sources/handshake", { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["handshake"] }),
  });

  if (!signedIn) {
    return <p className="px-5 py-4 text-xs text-lumi-muted">Sign in to connect your Handshake calendar.</p>;
  }

  if (data?.connected) {
    return (
      <Row
        label="Calendar export connected"
        sub={`Events from ${data.host ?? "Handshake"} are pulled on every sweep.${
          data.fromEnv ? " Set by the server; paste your own link to override." : ""
        }`}
      >
        <button
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
          className="text-xs text-lumi-muted hover:text-lumi-rose transition-colors disabled:opacity-40"
        >
          Disconnect
        </button>
      </Row>
    );
  }

  return (
    <div className="px-5 py-4">
      <p className="text-xs text-lumi-muted mb-3 leading-relaxed">
        In Handshake go to Settings → Calendar export and copy your calendar link. Lumi
        checks it on every sweep; no Google permission needed.
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) connect.mutate(url.trim());
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://app.joinhandshake.com/….ics"
          className="flex-1 text-xs bg-lumi-bg border border-lumi-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-lumi-accent transition-colors"
        />
        <button
          type="submit"
          disabled={!url.trim() || connect.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-lumi-accent px-3 py-1.5 text-xs font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors disabled:opacity-40"
        >
          {connect.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Connect
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-lumi-rose">{error}</p>}
    </div>
  );
}

/* ─── iCal subscription ─── */

type FeedLinks = { https: string; webcal: string };

function FeedSection({ signedIn }: { signedIn: boolean }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["calendar-feed"],
    queryFn: async () => {
      const res = await fetch("/api/calendar-feed");
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as FeedLinks;
    },
    enabled: signedIn,
    retry: false,
    staleTime: Infinity,
  });

  const rotate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calendar-feed", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as FeedLinks;
    },
    onSuccess: (links) => qc.setQueryData(["calendar-feed"], links),
  });

  async function copyFeed() {
    if (!data) return;
    await navigator.clipboard.writeText(data.https);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="px-5 py-4">
      <p className="text-sm text-lumi-muted mb-4 leading-relaxed">
        Subscribe Apple Calendar, or any iCal app, to your accepted and maybe events. The
        link is private to you: anyone holding it can read those events, so regenerate it
        if it leaks.
      </p>

      {!signedIn ? (
        <p className="text-xs text-lumi-muted">Sign in to get your subscription link.</p>
      ) : (
        <>
          <div className="rounded-lg border border-lumi-border bg-lumi-bg p-3 flex items-center gap-2">
            <code className="flex-1 text-xs text-lumi-text font-mono truncate">
              {isLoading ? "Loading…" : (data?.https ?? "Unavailable")}
            </code>
            <button
              onClick={copyFeed}
              disabled={!data}
              className="flex items-center gap-1 text-xs text-lumi-muted hover:text-lumi-text px-2 py-1 rounded hover:bg-lumi-surface transition-colors disabled:opacity-40"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-lumi-green" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy URL
                </>
              )}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <a
              href={data?.webcal ?? "#"}
              aria-disabled={!data}
              className="flex items-center gap-1.5 rounded-lg bg-lumi-accent px-3 py-2 text-xs font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors aria-disabled:opacity-40"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Apple Calendar
            </a>
            <button
              onClick={() => rotate.mutate()}
              disabled={!data || rotate.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-lumi-border px-3 py-2 text-xs font-medium text-lumi-muted hover:text-lumi-text hover:border-lumi-subtle transition-colors disabled:opacity-40"
            >
              {rotate.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Regenerate link
            </button>
          </div>
          {rotate.isSuccess && (
            <p className="mt-2 text-[11px] text-lumi-muted">
              New link issued. Re-subscribe in your calendar app; the old link no longer works.
            </p>
          )}

          <details className="mt-4 text-xs text-lumi-muted group">
            <summary className="cursor-pointer select-none text-lumi-subtle group-hover:text-lumi-muted">
              Manual setup (Calendar → File → New Calendar Subscription)
            </summary>
            <ol className="mt-2 ml-5 list-decimal space-y-1 leading-relaxed">
              <li>Open Calendar.app on your Mac.</li>
              <li>Go to File → New Calendar Subscription.</li>
              <li>Paste the URL above and click Subscribe.</li>
              <li>Set auto-refresh to 15 minutes, or whatever you prefer.</li>
            </ol>
          </details>
        </>
      )}
    </div>
  );
}

/* ─── Layout ─── */

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-xl border border-lumi-border bg-lumi-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-lumi-border flex items-center gap-2">
        <span className="text-lumi-accent">{icon}</span>
        <h2 className="font-serif text-base text-lumi-text">{title}</h2>
      </div>
      <div className="divide-y divide-lumi-border">{children}</div>
    </section>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 flex items-start justify-between gap-6">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-lumi-text">{label}</div>
        {sub && <div className="text-xs text-lumi-muted mt-0.5">{sub}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
