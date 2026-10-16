"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Nav } from "@/components/Nav";
import { StarCursor } from "@/components/StarCursor";
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
    <div className="lumi-custom-cursor min-h-screen flex flex-col bg-lumi-bg">
      <StarCursor />
      <Nav />

      <main className="flex-1 w-full max-w-[960px] mx-auto px-6 sm:px-10 pt-10 sm:pt-16 pb-24">
        <div className="flex flex-col gap-4 mb-14">
          <p className="animate-rise [animation-delay:80ms] inline-flex items-center gap-2.5 text-sm text-lumi-muted">
            <span className="w-2 h-2 rounded-full bg-lumi-accent" />
            Every control here does something; nothing is decorative.
          </p>
          <h1 className="animate-rise [animation-delay:200ms] font-serif text-[52px] sm:text-[72px] font-normal leading-[0.98] tracking-[-0.03em] text-lumi-text">
            Where Lumi reads, <span className="italic font-medium">ranks</span> and writes.
          </h1>
        </div>

        <Section title="Account">
          <AccountRow />
        </Section>

        <Section title="Email source">
          <InboxRow signedIn={signedIn} email={session?.user?.email ?? null} />
          <ForwardingRow signedIn={signedIn} />
        </Section>

        <Section title="Handshake">
          <HandshakeRow signedIn={signedIn} />
        </Section>

        <Section title="What matters to you">
          {signedIn ? (
            <ProfileEditor />
          ) : (
            <p className="py-5 text-sm text-lumi-muted">Sign in to set your interests.</p>
          )}
        </Section>

        <Section title="Your numbers — last 7 days">
          <MetricsCard />
        </Section>

        <Section title="Sync to Apple Calendar" id="calendar-feed">
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
    <div className="py-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="w-10 h-10 rounded-full border border-lumi-border" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-lumi-surface flex items-center justify-center text-sm font-semibold">
            {initial}
          </div>
        )}
        <div>
          <div className="text-[15px] font-semibold text-lumi-text">{email ?? "Demo mode"}</div>
          <div className="text-sm text-lumi-muted">
            {session ? "Connected via Google" : "Sample data only — sign in from the landing page"}
          </div>
        </div>
      </div>
      {session && (
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-1.5 text-sm font-semibold text-lumi-muted hover:text-lumi-rose transition-colors"
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
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={`w-1.5 h-1.5 rounded-full ${signedIn ? "bg-lumi-green" : "bg-lumi-border"}`} />
          <span className="text-lumi-text">{email ?? "Not connected"}</span>
        </div>
      </Row>
      <Row label="Scan now" sub="Pull new mail and your Handshake feed without waiting for the next sweep.">
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={() => scan.mutate()}
            disabled={!signedIn || scan.isPending}
            data-cursor="read my inbox" data-cursor-tone="blue"
            className="inline-flex items-center gap-2 min-h-[44px] rounded-full bg-lumi-surface px-5 text-sm font-semibold text-lumi-text transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {scan.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {scan.isPending ? "Scanning…" : "Scan now"}
          </button>
          {scan.isSuccess && (
            <span className="text-xs text-lumi-muted">
              {scan.data.newEmails} new email{scan.data.newEmails === 1 ? "" : "s"},{" "}
              {scan.data.eventsCreated + scan.data.handshake.eventsCreated} new event
              {scan.data.eventsCreated + scan.data.handshake.eventsCreated === 1 ? "" : "s"}
            </span>
          )}
          {scan.isError && <span className="text-xs text-lumi-rose">Scan failed. Try again?</span>}
          {!signedIn && <span className="text-xs text-lumi-subtle">Sign in to scan</span>}
        </div>
      </Row>
    </>
  );
}

/* ─── Forward to Lumi (no Gmail permission) ─── */

type ForwardingStatus = {
  configured: boolean;
  address: string | null;
  gmailConnected: boolean;
  confirmation: { code: string | null; link: string | null; forwarder: string | null; receivedAt: string } | null;
  lastReceivedAt: string | null;
};

/**
 * The alternative to granting Gmail access: a private address the user
 * forwards newsletters to. Events come back through the dashboard and the
 * iCal feed exactly as they would from a connected inbox.
 */
function ForwardingRow({ signedIn }: { signedIn: boolean }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["forwarding"],
    queryFn: async () => {
      const res = await fetch("/api/sources/forwarding");
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as ForwardingStatus;
    },
    enabled: signedIn,
    retry: false,
    // Gmail's confirmation mail arrives within a minute of the user asking
    // for it; poll until it has.
    refetchInterval: (q) => (q.state.data && !q.state.data.confirmation ? 20_000 : false),
  });

  const rotate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sources/forwarding", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as ForwardingStatus;
    },
    onSuccess: (next) => qc.setQueryData(["forwarding"], next),
  });

  async function copyAddress() {
    if (!data?.address) return;
    await navigator.clipboard.writeText(data.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!signedIn) {
    return (
      <Row label="Forward to Lumi" sub="Sign in to get a private forwarding address.">
        <span className="text-xs text-lumi-subtle">Sign in</span>
      </Row>
    );
  }

  if (data && !data.configured) {
    return (
      <Row
        label="Forward to Lumi"
        sub="Not available on this deployment: no inbound email domain is configured (INBOUND_EMAIL_DOMAIN)."
      >
        <span className="text-xs text-lumi-subtle">Unavailable</span>
      </Row>
    );
  }

  return (
    <div className="py-5">
      <div className="text-[15px] font-semibold text-lumi-text">Forward to Lumi</div>
      <p className="mt-1 text-sm text-lumi-muted leading-relaxed mb-4 max-w-[60ch]">
        {data?.gmailConnected
          ? "Also works alongside your connected inbox: anything forwarded here is read even if it lands outside the Inbox tab."
          : "No Gmail permission needed. Forward newsletters and invitations to this address and Lumi turns them into cards here and events in your calendar feed."}
      </p>

      <div className="rounded-2xl bg-lumi-surface pl-5 pr-2 py-2 flex items-center gap-3">
        <code className="flex-1 text-sm text-lumi-text font-mono truncate">
          {isLoading ? "Loading…" : (data?.address ?? "Unavailable")}
        </code>
        <button
          onClick={copyAddress}
          disabled={!data?.address}
          className="inline-flex items-center gap-1.5 min-h-[40px] rounded-full bg-white border-[1.5px] border-lumi-border px-4 text-sm font-semibold text-lumi-text hover:border-lumi-text transition-colors disabled:opacity-40"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-lumi-green" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy address
            </>
          )}
        </button>
      </div>

      {data?.confirmation && (
        <div className="mt-3 rounded-2xl bg-[#DCE3FF] p-4 text-sm text-lumi-text">
          <div className="font-medium">
            Gmail asked to confirm forwarding
            {data.confirmation.forwarder ? ` from ${data.confirmation.forwarder}` : ""}.
          </div>
          <div className="mt-1 text-lumi-muted leading-relaxed">
            {data.confirmation.code ? (
              <>
                Paste this code into the Gmail dialog:{" "}
                <code className="font-mono text-lumi-text">{data.confirmation.code}</code>
                {data.confirmation.link ? ", or " : "."}
              </>
            ) : null}
            {data.confirmation.link ? (
              <a
                href={data.confirmation.link}
                target="_blank"
                rel="noreferrer"
                className="text-lumi-accent hover:underline"
              >
                confirm with one click
              </a>
            ) : null}
            {data.confirmation.link ? "." : ""}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-lumi-subtle">
          {data?.lastReceivedAt
            ? `Last forwarded email received ${new Date(data.lastReceivedAt).toLocaleString()}`
            : "Nothing received yet"}
        </span>
        <button
          onClick={() => rotate.mutate()}
          disabled={!data?.address || rotate.isPending}
          className="inline-flex items-center gap-2 min-h-[44px] rounded-full bg-lumi-surface px-5 text-sm font-semibold text-lumi-text transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {rotate.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          New address
        </button>
      </div>
      {rotate.isSuccess && (
        <p className="mt-2 text-xs text-lumi-muted">
          New address issued. Update your Gmail filter; mail to the old one is dropped.
        </p>
      )}

      <details className="mt-5 text-sm text-lumi-muted group">
        <summary className="cursor-pointer select-none text-lumi-subtle group-hover:text-lumi-muted">
          Set up a Gmail filter that forwards automatically
        </summary>
        <ol className="mt-2 ml-5 list-decimal space-y-1 leading-relaxed">
          <li>
            Gmail → Settings → <span className="text-lumi-text">Forwarding and POP/IMAP</span> → Add a
            forwarding address → paste the address above.
          </li>
          <li>
            Gmail emails a confirmation to that address. The code shows up here within a minute; paste
            it back into Gmail.
          </li>
          <li>
            Gmail → Settings → <span className="text-lumi-text">Filters and Blocked Addresses</span> →
            Create a new filter. Match the senders you want Lumi to read, for example{" "}
            <code className="font-mono">from:(@nyu.edu OR @joinhandshake.com)</code>, or{" "}
            <code className="font-mono">list:(*)</code> for every newsletter.
          </li>
          <li>Choose “Forward it to” and pick the address. Done: matching mail reaches Lumi as it arrives.</li>
        </ol>
        <p className="mt-2 leading-relaxed">
          You can also forward a single email by hand; Lumi unwraps “Fwd:” messages and reads the
          original sender.
        </p>
      </details>
    </div>
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
    return <p className="py-5 text-sm text-lumi-muted">Sign in to connect your Handshake calendar.</p>;
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
          className="text-sm font-semibold text-lumi-muted hover:text-lumi-rose transition-colors disabled:opacity-40"
        >
          Disconnect
        </button>
      </Row>
    );
  }

  return (
    <div className="py-5">
      <p className="text-sm text-lumi-muted mb-4 leading-relaxed max-w-[60ch]">
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
          className="flex-1 min-w-0 min-h-[44px] text-sm bg-lumi-surface border-[1.5px] border-transparent rounded-full px-5 focus:outline-none focus:border-lumi-text transition-colors"
        />
        <button
          type="submit"
          disabled={!url.trim() || connect.isPending}
          className="inline-flex items-center gap-2 min-h-[44px] rounded-full bg-lumi-text px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          {connect.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
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
    <div className="py-5">
      <p className="text-sm text-lumi-muted mb-4 leading-relaxed max-w-[60ch]">
        Subscribe Apple Calendar, or any iCal app, to your accepted and maybe events. The
        link is private to you: anyone holding it can read those events, so regenerate it
        if it leaks.
      </p>

      {!signedIn ? (
        <p className="text-xs text-lumi-muted">Sign in to get your subscription link.</p>
      ) : (
        <>
          <div className="rounded-2xl bg-lumi-surface pl-5 pr-2 py-2 flex items-center gap-3">
            <code className="flex-1 text-sm text-lumi-text font-mono truncate">
              {isLoading ? "Loading…" : (data?.https ?? "Unavailable")}
            </code>
            <button
              onClick={copyFeed}
              disabled={!data}
              className="inline-flex items-center gap-1.5 min-h-[40px] rounded-full bg-white border-[1.5px] border-lumi-border px-4 text-sm font-semibold text-lumi-text hover:border-lumi-text transition-colors disabled:opacity-40"
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={data?.webcal ?? "#"}
              aria-disabled={!data}
              data-cursor="subscribe" data-cursor-tone="mark"
              className="inline-flex items-center gap-2 min-h-[44px] rounded-full bg-lumi-text px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed aria-disabled:opacity-40"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Apple Calendar
            </a>
            <button
              onClick={() => rotate.mutate()}
              disabled={!data || rotate.isPending}
              className="inline-flex items-center gap-2 min-h-[44px] rounded-full bg-lumi-surface px-5 text-sm font-semibold text-lumi-text transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {rotate.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate link
            </button>
          </div>
          {rotate.isSuccess && (
            <p className="mt-2 text-xs text-lumi-muted">
              New link issued. Re-subscribe in your calendar app; the old link no longer works.
            </p>
          )}

          <details className="mt-5 text-sm text-lumi-muted group">
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

/**
 * A section is a hairline, a serif heading on the left and its rows on the
 * right; on a phone the heading sits above. No boxes around anything.
 */
function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-x-12 gap-y-2 border-t border-lumi-border py-8 scroll-mt-24"
    >
      <h2 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-lumi-text md:pt-5">
        {title}
      </h2>
      <div className="min-w-0 divide-y divide-lumi-border">{children}</div>
    </section>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="py-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
      <div className="flex-1 min-w-[220px]">
        <div className="text-[15px] font-semibold text-lumi-text">{label}</div>
        {sub && <div className="text-sm text-lumi-muted mt-1 leading-relaxed">{sub}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
