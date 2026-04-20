"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  Calendar,
  Mail,
  Sparkles,
  Bell,
  Shield,
  Check,
  LogOut,
  Rss,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Nav } from "@/components/Nav";

export default function SettingsPage() {
  const [llmFallback, setLlmFallback] = useState(true);
  const [conflictWarnings, setConflictWarnings] = useState(true);
  const [maybeReminders, setMaybeReminders] = useState(true);
  const [keywords, setKeywords] = useState(
    "invite, rsvp, join us, reception, dinner, fellowship deadline"
  );
  const [calendarId, setCalendarId] = useState("primary");
  const [timezone, setTimezone] = useState("America/New_York");

  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  const feedUrl = `${origin}/api/calendar.ics`;
  const webcalUrl = origin.startsWith("https")
    ? feedUrl.replace(/^https/, "webcal")
    : feedUrl.replace(/^http/, "webcal");
  async function copyFeed() {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <h1 className="font-serif text-3xl text-lumi-text mb-1">Settings</h1>
        <p className="text-sm text-lumi-muted mb-10">
          Tune how Lumi detects events and where it writes them.
        </p>

        {/* Account */}
        <Section icon={<Shield className="w-4 h-4" />} title="Account">
          <AccountRow />
        </Section>

        {/* Email */}
        <Section icon={<Mail className="w-4 h-4" />} title="Email source">
          <Row
            label="Connected inbox"
            sub="Lumi scans new mail in real time via Gmail API push."
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-lumi-green" />
              <span className="text-lumi-text">annie@livingbrands.ai</span>
            </div>
          </Row>
          <Row
            label="Scan only certain senders"
            sub="Whitelist specific domains, or leave blank to scan everything."
          >
            <input
              placeholder="nyu.edu, eventbrite.com"
              className="w-56 text-xs bg-lumi-bg border border-lumi-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-lumi-accent transition-colors"
            />
          </Row>
        </Section>

        {/* Detection */}
        <Section icon={<Sparkles className="w-4 h-4" />} title="Detection">
          <Row
            label="LLM extraction fallback"
            sub="When structured markup & keywords miss, ask Claude to extract the event."
          >
            <Toggle value={llmFallback} onChange={setLlmFallback} />
          </Row>
          <Row
            label="Keywords"
            sub="Comma-separated. An email containing any of these triggers parsing."
          >
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full max-w-md text-xs bg-lumi-bg border border-lumi-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-lumi-accent transition-colors"
            />
          </Row>
        </Section>

        {/* Calendar */}
        <Section icon={<Calendar className="w-4 h-4" />} title="Calendar">
          <Row label="Write accepted events to" sub="Choose which Google Calendar to sync.">
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="text-xs bg-lumi-bg border border-lumi-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-lumi-accent"
            >
              <option value="primary">Primary — annie@livingbrands.ai</option>
              <option value="personal">Personal</option>
              <option value="work">Work</option>
            </select>
          </Row>
          <Row label="Timezone" sub="Used when email doesn't specify one.">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="text-xs bg-lumi-bg border border-lumi-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-lumi-accent"
            >
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
            </select>
          </Row>
          <Row
            label="Conflict warnings"
            sub="Flag accepts that overlap with existing calendar events."
          >
            <Toggle value={conflictWarnings} onChange={setConflictWarnings} />
          </Row>
        </Section>

        {/* iCal sync */}
        <Section icon={<Rss className="w-4 h-4" />} title="Sync to iCal / Apple Calendar">
          <div className="px-5 py-4">
            <p className="text-sm text-lumi-muted mb-4 leading-relaxed">
              Subscribe Apple Calendar (or any iCal-compatible app) to Lumi. Your
              accepted and maybe events will appear as a read-only calendar and
              refresh automatically.
            </p>

            <div className="rounded-lg border border-lumi-border bg-lumi-bg p-3 flex items-center gap-2">
              <code className="flex-1 text-xs text-lumi-text font-mono truncate">
                {feedUrl || "Loading…"}
              </code>
              <button
                onClick={copyFeed}
                disabled={!origin}
                className="flex items-center gap-1 text-xs text-lumi-muted hover:text-lumi-text px-2 py-1 rounded hover:bg-lumi-surface transition-colors"
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
                href={webcalUrl || "#"}
                className="flex items-center gap-1.5 rounded-lg bg-lumi-accent px-3 py-2 text-xs font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Apple Calendar
              </a>
              <a
                href={feedUrl || "#"}
                className="flex items-center gap-1.5 rounded-lg border border-lumi-border px-3 py-2 text-xs font-medium text-lumi-muted hover:text-lumi-text hover:border-lumi-subtle transition-colors"
              >
                Preview feed
              </a>
            </div>

            <details className="mt-4 text-xs text-lumi-muted group">
              <summary className="cursor-pointer select-none text-lumi-subtle group-hover:text-lumi-muted">
                Manual setup (Calendar → File → New Calendar Subscription)
              </summary>
              <ol className="mt-2 ml-5 list-decimal space-y-1 leading-relaxed">
                <li>Open Calendar.app on your Mac.</li>
                <li>Go to File → New Calendar Subscription.</li>
                <li>Paste the URL above and click Subscribe.</li>
                <li>Set auto-refresh to 15 minutes (or your preference).</li>
              </ol>
            </details>
          </div>
        </Section>

        {/* Notifications */}
        <Section icon={<Bell className="w-4 h-4" />} title="Notifications">
          <Row
            label="Maybe reminders"
            sub="Nudge me 48h before a 'maybe' event I haven't resolved."
          >
            <Toggle value={maybeReminders} onChange={setMaybeReminders} />
          </Row>
        </Section>

        <div className="mt-10 flex items-center justify-end gap-3">
          <button className="text-xs text-lumi-muted hover:text-lumi-text transition-colors">
            Discard
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-lumi-accent px-4 py-2 text-xs font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors">
            <Check className="w-3.5 h-3.5" />
            Save changes
          </button>
        </div>
      </main>
    </div>
  );
}

function AccountRow() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "annie@livingbrands.ai";
  const image = session?.user?.image;
  return (
    <div className="px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="w-10 h-10 rounded-full border border-lumi-border"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-lumi-bg border border-lumi-border flex items-center justify-center text-sm font-medium">
            {email.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-sm text-lumi-text">{email}</div>
          <div className="text-xs text-lumi-muted">
            {session ? "Connected via Google" : "Demo mode — sign in on landing"}
          </div>
        </div>
      </div>
      {session && (
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-1.5 text-xs text-lumi-muted hover:text-lumi-rose transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Disconnect
        </button>
      )}
    </div>
  );
}

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

function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
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

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        value ? "bg-lumi-accent" : "bg-lumi-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-lumi-bg transition-transform ${
          value ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
