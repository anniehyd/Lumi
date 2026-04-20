"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { ArrowRight, Calendar, Mail, Sparkles, Zap } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav (minimal — landing has its own CTA) */}
      <header className="border-b border-lumi-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-lumi-accent to-lumi-blue flex items-center justify-center text-sm">
              ✦
            </div>
            <span className="font-serif text-lg tracking-tight">Lumi</span>
          </div>
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="text-sm text-lumi-muted hover:text-lumi-text transition-colors"
          >
            Sign in
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 max-w-5xl mx-auto w-full px-6 py-20 sm:py-28 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lumi-border bg-lumi-surface text-xs text-lumi-muted mb-6">
          <Sparkles className="w-3 h-3 text-lumi-accent" />
          Powered by Claude
        </div>

        <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] text-lumi-text tracking-tight">
          Every invite,
          <br />
          <span className="italic text-lumi-accent">sorted.</span>
        </h1>

        <p className="mt-6 max-w-xl mx-auto text-lg text-lumi-muted leading-relaxed">
          Lumi reads your inbox, pulls out the event details that matter, and
          asks one simple question: <em>attending?</em>
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="group flex items-center gap-2 rounded-lg bg-lumi-accent px-5 py-3 text-sm font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors"
          >
            Connect Gmail
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg border border-lumi-border px-5 py-3 text-sm font-medium text-lumi-muted hover:text-lumi-text hover:border-lumi-subtle transition-colors"
          >
            View demo
          </Link>
        </div>

        {/* Feature triplet */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <Feature
            icon={<Mail className="w-5 h-5" />}
            title="Detects invites automatically"
            body="ICS attachments, HTML schema, keywords, or LLM fallback — no setup, no rules to write."
          />
          <Feature
            icon={<Zap className="w-5 h-5" />}
            title="Pulls out what matters"
            body="Title, time, location, dress code, RSVP deadline — structured, editable, and traceable to the source email."
          />
          <Feature
            icon={<Calendar className="w-5 h-5" />}
            title="One click to your calendar"
            body="Accept and Lumi writes it to Google Calendar with reminders and conflict detection."
          />
        </div>

        {/* How it works */}
        <div className="mt-24 rounded-2xl border border-lumi-border bg-lumi-surface p-8 sm:p-10 text-left">
          <h2 className="font-serif text-2xl text-lumi-text mb-6">How it works</h2>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm">
            {[
              "Email arrives",
              "Detect",
              "Extract",
              "You decide",
              "Synced",
            ].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-3 md:flex-col md:text-center">
                <div className="w-8 h-8 rounded-full border border-lumi-border bg-lumi-bg flex items-center justify-center font-mono text-xs text-lumi-accent">
                  {i + 1}
                </div>
                <span className="text-lumi-text">{step}</span>
                {i < arr.length - 1 && (
                  <span className="hidden md:block text-lumi-subtle flex-1 h-px bg-lumi-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-lumi-border py-6 text-center text-xs text-lumi-subtle">
        Lumi · Open source · MIT
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-lumi-border bg-lumi-surface p-5">
      <div className="w-9 h-9 rounded-lg bg-lumi-bg border border-lumi-border flex items-center justify-center text-lumi-accent mb-4">
        {icon}
      </div>
      <h3 className="font-serif text-lg text-lumi-text mb-2">{title}</h3>
      <p className="text-sm text-lumi-muted leading-relaxed">{body}</p>
    </div>
  );
}
