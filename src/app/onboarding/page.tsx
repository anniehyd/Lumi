"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Calendar,
  Sparkles,
  Check,
  ArrowRight,
  Loader2,
} from "lucide-react";

type Step = 0 | 1 | 2 | 3;

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(0);

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
            {[0, 1, 2].map((i) => (
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
          {step === 2 && <StepFirstScan key="scan" onNext={() => setStep(3)} />}
          {step === 3 && <StepDone key="done" />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className="max-w-md w-full text-center"
    >
      {children}
    </motion.div>
  );
}

function StepConnectGmail({ onNext }: { onNext: () => void }) {
  return (
    <Shell>
      <div className="mx-auto w-14 h-14 rounded-2xl bg-lumi-surface border border-lumi-border flex items-center justify-center mb-6">
        <Mail className="w-6 h-6 text-lumi-accent" />
      </div>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">Connect your Gmail</h1>
      <p className="text-sm text-lumi-muted mb-8 leading-relaxed">
        Lumi reads incoming mail to find event invitations. We never send, delete,
        or modify your messages.
      </p>
      <button
        onClick={onNext}
        className="group w-full flex items-center justify-center gap-2 rounded-lg bg-lumi-accent px-5 py-3 text-sm font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors"
      >
        Continue with Google
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </button>
      <p className="mt-4 text-[11px] text-lumi-subtle">
        Read-only scope · Revoke anytime from your Google Account
      </p>
    </Shell>
  );
}

function StepConnectCalendar({ onNext }: { onNext: () => void }) {
  return (
    <Shell>
      <div className="mx-auto w-14 h-14 rounded-2xl bg-lumi-surface border border-lumi-border flex items-center justify-center mb-6">
        <Calendar className="w-6 h-6 text-lumi-accent" />
      </div>
      <h1 className="font-serif text-4xl text-lumi-text mb-3">Connect your calendar</h1>
      <p className="text-sm text-lumi-muted mb-8 leading-relaxed">
        When you tap <span className="text-lumi-text">Attend</span>, Lumi writes
        the event to Google Calendar with reminders.
      </p>
      <button
        onClick={onNext}
        className="group w-full flex items-center justify-center gap-2 rounded-lg bg-lumi-accent px-5 py-3 text-sm font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors"
      >
        Authorize Calendar
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </Shell>
  );
}

const scanSteps = [
  "Reading the last 30 days of mail",
  "Checking for calendar attachments",
  "Looking for structured event markup",
  "Asking Claude to extract details",
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
                i < idx ? "text-lumi-muted line-through" : i === idx ? "text-lumi-text" : "text-lumi-subtle"
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
      <h1 className="font-serif text-4xl text-lumi-text mb-3">You're set.</h1>
      <p className="text-sm text-lumi-muted">Opening your inbox…</p>
    </Shell>
  );
}
