"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Mail,
  Calendar,
  Sparkles,
  Check,
  Copy,
  ArrowRight,
  Loader2,
  Compass,
  Link2,
} from "lucide-react";
import { ROLES, INTERESTS, type UserProfile } from "@/lib/profile";
import { connectGoogle } from "@/lib/googleConnect";

/**
 * One-time setup. Shown only while User.onboardedAt is null — OnboardingGate
 * redirects here, and finishing stamps the flag so it never appears again.
 * The profile stays editable afterwards from Settings.
 *
 * Two screens: what the user cares about, then where Lumi should look. The
 * user is already signed in (name and email only); nothing here needs a
 * Google permission unless they choose to connect Gmail and Calendar.
 */

type Step = 0 | 1 | 2 | 3;
const TOTAL_VISIBLE = 2; // Interests, Sources

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(0);
  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    school: "",
    gradYear: "",
    interests: [],
    note: "",
  });
  const [handshakeFeedUrl, setHandshakeFeedUrl] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Persist the profile and stamp onboardedAt. */
  const save = useCallback(async () => {
    setSaveError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile,
          handshakeFeedUrl: handshakeFeedUrl.trim() || null,
          complete: true,
        }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      return true;
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Could not save your preferences. Try again."
      );
      return false;
    }
  }, [profile, handshakeFeedUrl]);

  const finish = useCallback(async () => {
    if (await save()) setStep(2);
  }, [save]);

  /**
   * Leaving for Google's consent screen ends this page, so the profile is
   * saved first; onboardedAt is stamped, and the callback lands on the
   * dashboard rather than back here.
   */
  const connect = useCallback(async () => {
    if (await save()) await connectGoogle("/dashboard");
  }, [save]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-lumi-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-lumi-accent to-lumi-blue flex items-center justify-center text-sm">
              ✦
            </div>
            <span className="font-serif text-lg tracking-tight">Lumi</span>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_VISIBLE }).map((_, i) => (
              <div
                key={i}
                className={`h-1 w-10 rounded-full transition-colors ${
                  i <= step ? "bg-lumi-accent" : "bg-lumi-border"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <StepInterests
              key="interests"
              profile={profile}
              setProfile={setProfile}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <StepSources
              key="sources"
              handshake={handshakeFeedUrl}
              setHandshake={setHandshakeFeedUrl}
              onConnect={connect}
              onFinish={finish}
              error={saveError}
            />
          )}
          {step === 2 && <StepFirstScan key="scan" onNext={() => setStep(3)} />}
          {step === 3 && <StepDone key="done" />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className={`${wide ? "max-w-lg" : "max-w-md"} w-full text-center`}
    >
      {children}
    </motion.div>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-14 h-14 rounded-2xl bg-lumi-surface border border-lumi-border flex items-center justify-center mb-6">
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group w-full flex items-center justify-center gap-2 rounded-lg bg-lumi-accent px-5 py-3 text-sm font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/**
 * The step that makes Lumi multi-user. Without it every account is scored
 * against one hardcoded rubric, and anyone who isn't a CS student gets
 * relevance scores that look broken to them.
 */
function StepInterests({
  profile,
  setProfile,
  onNext,
}: {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onNext: () => void;
}) {
  const toggle = (interest: string) => {
    const has = profile.interests.includes(interest);
    setProfile({
      ...profile,
      interests: has
        ? profile.interests.filter((i) => i !== interest)
        : [...profile.interests, interest],
    });
  };

  return (
    <Shell wide>
      <Icon>
        <Compass className="w-6 h-6 text-lumi-accent" />
      </Icon>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">What matters to you?</h1>
      <p className="text-sm text-lumi-muted mb-8 leading-relaxed">
        Lumi ranks every event it finds from 1 to 5. This is how it knows what a 5
        looks like for you.
      </p>

      <div className="text-left space-y-6">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-2.5">
            You are
          </label>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => setProfile({ ...profile, role: r.id })}
                className={`rounded-full px-3.5 py-1.5 text-xs border transition-colors ${
                  profile.role === r.id
                    ? "bg-lumi-accent text-lumi-bg border-lumi-accent"
                    : "border-lumi-border text-lumi-muted hover:border-lumi-accent/50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-2.5">
            Never let me miss
          </label>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`rounded-full px-3.5 py-1.5 text-xs border transition-colors ${
                  profile.interests.includes(i)
                    ? "bg-lumi-accent text-lumi-bg border-lumi-accent"
                    : "border-lumi-border text-lumi-muted hover:border-lumi-accent/50"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-2">
              School
            </label>
            <input
              value={profile.school ?? ""}
              onChange={(e) => setProfile({ ...profile, school: e.target.value })}
              placeholder="NYU"
              className="w-full rounded-lg bg-lumi-surface border border-lumi-border px-3 py-2 text-sm text-lumi-text placeholder:text-lumi-subtle focus:border-lumi-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-2">
              Graduating
            </label>
            <input
              value={profile.gradYear ?? ""}
              onChange={(e) => setProfile({ ...profile, gradYear: e.target.value })}
              placeholder="2029"
              className="w-full rounded-lg bg-lumi-surface border border-lumi-border px-3 py-2 text-sm text-lumi-text placeholder:text-lumi-subtle focus:border-lumi-accent focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-2">
            In your own words
          </label>
          <textarea
            value={profile.note ?? ""}
            onChange={(e) => setProfile({ ...profile, note: e.target.value })}
            rows={3}
            placeholder="I'm recruiting for SWE internships, and I'd go to anything where I'd meet people in infra."
            className="w-full rounded-lg bg-lumi-surface border border-lumi-border px-3 py-2 text-sm text-lumi-text placeholder:text-lumi-subtle focus:border-lumi-accent focus:outline-none resize-none"
          />
          <p className="mt-1.5 text-[11px] text-lumi-subtle">
            This one line does more than the chips above. Be specific.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <PrimaryButton onClick={onNext} disabled={!profile.role}>
          Continue
        </PrimaryButton>
      </div>
    </Shell>
  );
}

type ForwardingStatus = { configured: boolean; address: string | null };

/**
 * Where Lumi should look. Three sources, none required to finish:
 *   - the forwarding address, which needs no Google permission at all and is
 *     the path that works for anyone while the OAuth app is unverified;
 *   - Gmail + Google Calendar, a second Google authorization (optional);
 *   - the Handshake calendar export link.
 * The user can also do all of this later from Settings.
 */
function StepSources({
  handshake,
  setHandshake,
  onConnect,
  onFinish,
  error,
}: {
  handshake: string;
  setHandshake: (v: string) => void;
  onConnect: () => void;
  onFinish: () => void;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const { data: forwarding } = useQuery({
    queryKey: ["forwarding"],
    queryFn: async () => {
      const res = await fetch("/api/sources/forwarding");
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as ForwardingStatus;
    },
    retry: false,
  });

  async function copyAddress() {
    if (!forwarding?.address) return;
    await navigator.clipboard.writeText(forwarding.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Shell wide>
      <Icon>
        <Mail className="w-6 h-6 text-lumi-accent" />
      </Icon>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">Where should Lumi look?</h1>
      <p className="text-sm text-lumi-muted mb-8 leading-relaxed">
        Pick any, or none for now. Everything here is also in Settings.
      </p>

      <div className="text-left space-y-4">
        {forwarding?.configured && forwarding.address && (
          <SourceCard
            icon={<Mail className="w-4 h-4" />}
            title="Forward newsletters to Lumi"
            body="No Google permission needed. Forward an email by hand, or set a Gmail filter to forward automatically."
          >
            <div className="rounded-lg bg-lumi-bg border border-lumi-border pl-3 pr-1 py-1 flex items-center gap-2">
              <code className="flex-1 text-xs text-lumi-text font-mono truncate">{forwarding.address}</code>
              <button
                onClick={copyAddress}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-lumi-muted hover:text-lumi-text transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-lumi-green" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </SourceCard>
        )}

        <SourceCard
          icon={<Calendar className="w-4 h-4" />}
          title="Connect Gmail and Google Calendar"
          body="Lumi sweeps your Inbox tab twice a day (read-only) and writes the events you accept to your calendar."
        >
          <button
            onClick={() => {
              setConnecting(true);
              onConnect();
            }}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-lg border border-lumi-border px-3.5 py-2 text-xs font-semibold text-lumi-text hover:border-lumi-accent/50 transition-colors disabled:opacity-40"
          >
            {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Continue with Google
          </button>
          <p className="mt-2 text-[11px] text-lumi-subtle">
            Google may warn that Lumi is not yet verified. The access is read-only and you can
            revoke it any time from your Google Account.
          </p>
        </SourceCard>

        <SourceCard
          icon={<Link2 className="w-4 h-4" />}
          title="Add Handshake"
          body="In Handshake go to Settings → Calendar export and paste your calendar link."
        >
          <input
            value={handshake}
            onChange={(e) => setHandshake(e.target.value)}
            placeholder="https://app.joinhandshake.com/…​.ics"
            className="w-full rounded-lg bg-lumi-bg border border-lumi-border px-3 py-2 text-sm text-lumi-text placeholder:text-lumi-subtle focus:border-lumi-accent focus:outline-none"
          />
        </SourceCard>
      </div>

      {error && <p className="mt-4 text-xs text-lumi-rose">{error}</p>}
      <div className="mt-8">
        <PrimaryButton onClick={onFinish}>
          {handshake.trim() ? "Finish setup" : "Finish, I'll decide later"}
        </PrimaryButton>
      </div>
    </Shell>
  );
}

function SourceCard({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-lumi-border bg-lumi-surface p-4">
      <div className="flex items-center gap-2 text-lumi-accent mb-1">
        {icon}
        <span className="text-sm font-semibold text-lumi-text">{title}</span>
      </div>
      <p className="text-xs text-lumi-muted leading-relaxed mb-3">{body}</p>
      {children}
    </div>
  );
}

const scanSteps = [
  "Reading the last 30 days of mail",
  "Checking for calendar attachments",
  "Looking for structured event markup",
  "Extracting event details",
  "Ranking against your interests",
  "Building your inbox",
];

function StepFirstScan({ onNext }: { onNext: () => void }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (idx >= scanSteps.length) {
      const t = setTimeout(onNext, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIdx((i) => i + 1), 700);
    return () => clearTimeout(t);
  }, [idx, onNext]);

  return (
    <Shell>
      <div className="mx-auto w-14 h-14 rounded-2xl bg-lumi-surface border border-lumi-border flex items-center justify-center mb-6 relative">
        <Sparkles className="w-6 h-6 text-lumi-accent" />
        <motion.div
          className="absolute inset-0 rounded-2xl border-2 border-lumi-accent"
          animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.15, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      </div>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">First scan</h1>
      <p className="text-sm text-lumi-muted mb-8">
        This takes about a minute. Lumi will keep learning as new mail arrives.
      </p>

      <ul className="text-left space-y-2.5 text-sm">
        {scanSteps.map((label, i) => (
          <li key={label} className="flex items-center gap-3">
            <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center">
              {i < idx ? (
                <Check className="w-4 h-4 text-lumi-green" />
              ) : i === idx ? (
                <Loader2 className="w-4 h-4 text-lumi-accent animate-spin" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-lumi-border" />
              )}
            </span>
            <span
              className={
                i < idx
                  ? "text-lumi-muted line-through"
                  : i === idx
                    ? "text-lumi-text"
                    : "text-lumi-subtle"
              }
            >
              {label}
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function StepDone() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.push("/dashboard"), 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <Shell>
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="mx-auto w-16 h-16 rounded-full bg-lumi-green/20 border border-lumi-green/40 flex items-center justify-center mb-6"
      >
        <Check className="w-8 h-8 text-lumi-green" />
      </motion.div>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">You&apos;re set.</h1>
      <p className="text-sm text-lumi-muted">Opening your inbox…</p>
    </Shell>
  );
}
