"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Calendar,
  Sparkles,
  Check,
  ArrowRight,
  Loader2,
  Compass,
  Link2,
} from "lucide-react";
import { ROLES, INTERESTS, type UserProfile } from "@/lib/profile";

/**
 * One-time setup. Shown only while User.onboardedAt is null — OnboardingGate
 * redirects here, and finishing stamps the flag so it never appears again.
 * The profile stays editable afterwards from Settings.
 */

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const TOTAL_VISIBLE = 4; // Gmail, Calendar, Interests, Handshake

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

  /** Persist and stamp onboardedAt, then run the scan animation. */
  const finish = useCallback(async () => {
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
      setStep(4);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Could not save your preferences. Try again."
      );
    }
  }, [profile, handshakeFeedUrl]);

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
          {step === 0 && <StepConnectGmail key="gmail" onNext={() => setStep(1)} />}
          {step === 1 && <StepConnectCalendar key="cal" onNext={() => setStep(2)} />}
          {step === 2 && (
            <StepInterests
              key="interests"
              profile={profile}
              setProfile={setProfile}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <StepHandshake
              key="handshake"
              value={handshakeFeedUrl}
              setValue={setHandshakeFeedUrl}
              onNext={finish}
              error={saveError}
            />
          )}
          {step === 4 && <StepFirstScan key="scan" onNext={() => setStep(5)} />}
          {step === 5 && <StepDone key="done" />}
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

function StepConnectGmail({ onNext }: { onNext: () => void }) {
  return (
    <Shell>
      <Icon>
        <Mail className="w-6 h-6 text-lumi-accent" />
      </Icon>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">Connect your Gmail</h1>
      <p className="text-sm text-lumi-muted mb-8 leading-relaxed">
        Lumi reads incoming mail to find event invitations. We never send, delete,
        or modify your messages.
      </p>
      <PrimaryButton onClick={onNext}>Continue with Google</PrimaryButton>
      <p className="mt-4 text-[11px] text-lumi-subtle">
        Read-only scope · Revoke anytime from your Google Account
      </p>
    </Shell>
  );
}

function StepConnectCalendar({ onNext }: { onNext: () => void }) {
  return (
    <Shell>
      <Icon>
        <Calendar className="w-6 h-6 text-lumi-accent" />
      </Icon>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">Connect your calendar</h1>
      <p className="text-sm text-lumi-muted mb-8 leading-relaxed">
        When you tap <span className="text-lumi-text">Attend</span>, Lumi writes
        the event to Google Calendar with reminders.
      </p>
      <PrimaryButton onClick={onNext}>Authorize Calendar</PrimaryButton>
    </Shell>
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

/**
 * Optional, and deliberately last: an ingestion source that needs no Google
 * authorization at all, which is the only path that works while the OAuth app
 * is still in Testing.
 */
function StepHandshake({
  value,
  setValue,
  onNext,
  error,
}: {
  value: string;
  setValue: (v: string) => void;
  onNext: () => void;
  error: string | null;
}) {
  return (
    <Shell>
      <Icon>
        <Link2 className="w-6 h-6 text-lumi-accent" />
      </Icon>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">Add Handshake</h1>
      <p className="text-sm text-lumi-muted mb-8 leading-relaxed">
        Optional, and the fastest way to see Lumi work. In Handshake go to
        Settings → Calendar export and copy your calendar link.
      </p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://app.joinhandshake.com/…​.ics"
        className="w-full rounded-lg bg-lumi-surface border border-lumi-border px-3 py-2.5 text-sm text-lumi-text placeholder:text-lumi-subtle focus:border-lumi-accent focus:outline-none mb-4"
      />
      {error && <p className="mb-4 text-xs text-lumi-rose">{error}</p>}
      <PrimaryButton onClick={onNext}>
        {value.trim() ? "Finish setup" : "Skip for now"}
      </PrimaryButton>
    </Shell>
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
