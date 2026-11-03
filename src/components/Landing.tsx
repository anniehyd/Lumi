"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { StarCursor } from "@/components/StarCursor";

/**
 * The front door. Same paper, ink and accent as the dashboard, and the same
 * honesty: it shows what a card looks like, says exactly what sign-in asks
 * for, and lists the three ways mail reaches Lumi. Nothing here promises a
 * feature the app does not have.
 *
 * `demoBase` is where the demo links go: "" on a demo deployment (the
 * dashboard on this same host serves sample mail) or the demo host's origin
 * on the live deployment, where /dashboard would only bounce a visitor to
 * sign-in. The server page reads it from the environment.
 */
export function Landing({ demoBase = "" }: { demoBase?: string }) {
  const start = () => signIn("google", { callbackUrl: "/dashboard" });
  const demo = `${demoBase}/dashboard`;
  const poll = `${demoBase}/meet/demo-study-group`;

  return (
    <div className="lumi-custom-cursor min-h-screen flex flex-col bg-lumi-bg">
      <StarCursor />

      <header className="sticky top-0 z-50 bg-lumi-bg/85 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-5 flex items-center justify-between gap-4">
          <span className="font-serif font-serif-soft text-[26px] font-semibold tracking-[-0.02em] text-lumi-text">
            Lumi<span className="text-lumi-accent">.</span>
          </span>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href={demo} data-cursor="demo" data-cursor-tone="ink" className="text-lumi-muted hover:text-lumi-text transition-colors">
              Demo
            </Link>
            <a
              href="https://github.com/anniehyd/Lumi"
              target="_blank"
              rel="noreferrer"
              data-cursor="source"
              data-cursor-tone="ink"
              className="text-lumi-muted hover:text-lumi-text transition-colors"
            >
              GitHub
            </a>
            <button
              onClick={start}
              data-cursor="sign in"
              data-cursor-tone="blue"
              className="rounded-full bg-lumi-text px-4 py-2 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              Sign in
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1040px] mx-auto px-6 sm:px-10 pt-14 sm:pt-24 pb-24 flex flex-col gap-24 sm:gap-32">
        {/* ── Hero ── */}
        <section className="flex flex-col gap-8">
          <h1 className="animate-rise font-serif font-serif-soft font-medium text-[44px] sm:text-[72px] leading-[1.0] tracking-[-0.03em] text-lumi-text max-w-[14ch]">
            Every invite,{" "}
            <span className="relative inline-block italic">
              <span
                aria-hidden="true"
                className="animate-mark absolute -left-1 -right-2 bottom-[6px] h-[34%] rounded-sm bg-lumi-mark origin-left"
              />
              <span className="relative">sorted.</span>
            </span>
          </h1>

          <p className="animate-rise [animation-delay:120ms] max-w-[52ch] text-[18px] sm:text-[20px] leading-relaxed text-lumi-text">
            Lumi reads the newsletters and announcements in a student&rsquo;s inbox,
            pulls out the events, ranks them by how well they fit you, and asks one
            question per event: <em className="font-serif">attending?</em> Yes goes
            straight to your calendar. Nothing lands there until you say so.
          </p>

          <div className="animate-rise [animation-delay:220ms] flex flex-wrap items-center gap-3">
            <button
              onClick={start}
              data-cursor="let's go"
              data-cursor-tone="mark"
              className="min-h-[50px] rounded-full bg-lumi-text px-6 text-[15px] font-semibold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_10px_24px_-14px_rgba(17,17,17,0.45)] active:scale-[0.98]"
            >
              Sign in with Google →
            </button>
            <Link
              href={demo}
              data-cursor="look around"
              data-cursor-tone="ink"
              className="min-h-[50px] inline-flex items-center rounded-full border-[1.5px] border-lumi-text bg-white px-6 text-[15px] font-semibold text-lumi-text transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.03] active:scale-[0.98]"
            >
              Try the demo
            </Link>
          </div>

          <p className="animate-rise [animation-delay:300ms] text-sm text-lumi-muted max-w-[60ch]">
            Sign-in asks for your name and email, nothing else. Connecting Gmail is
            optional: you can forward newsletters to Lumi instead, and your Handshake
            calendar works with no permission at all.
          </p>
        </section>

        {/* ── A card, as it appears on the dashboard ── */}
        <section className="flex flex-col gap-6">
          <Eyebrow>What a card looks like</Eyebrow>
          <SampleCard demo={demo} />
          <p className="text-sm text-lumi-muted max-w-[64ch]">
            Stars are how well the event fits what you told Lumi you care about.
            The sentence is Lumi&rsquo;s read of the email. The red line appears
            only when something on your calendar overlaps. Attend writes it to your
            calendar; Skip asks why, so the ranking learns.
          </p>
        </section>

        {/* ── Three ways in ── */}
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Eyebrow>Three ways in</Eyebrow>
            <h2 className="font-serif font-serif-soft font-medium text-[30px] sm:text-[40px] leading-[1.08] tracking-[-0.025em] text-lumi-text max-w-[22ch]">
              Pick how much of your inbox Lumi may see.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-lumi-border rounded-[20px] overflow-hidden border border-lumi-border">
            <Way
              n="01"
              title="Gmail"
              body="Lumi sweeps your inbox tab twice a day, 1 PM and 7 PM New York. Only mail newer than the last sweep. Never Promotions, Social, archived or sent mail."
              needs="An optional Gmail and Calendar grant after sign-in."
            />
            <Way
              n="02"
              title="Forward to Lumi"
              body="You get a private lumi+ address. Forward one newsletter by hand, or set a Gmail filter so the senders you choose forward themselves."
              needs="Nothing. No Google permission at all."
            />
            <Way
              n="03"
              title="Handshake"
              body="Paste the calendar export link from your Handshake settings. Every event you register for there is pulled on each sweep."
              needs="One link, copied once."
            />
          </div>
        </section>

        {/* ── Polls ── */}
        <section className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-10 md:gap-16 items-start">
          <div className="flex flex-col gap-5">
            <Eyebrow>Then the next question</Eyebrow>
            <h2 className="font-serif font-serif-soft font-medium text-[30px] sm:text-[40px] leading-[1.08] tracking-[-0.025em] text-lumi-text">
              When can all of us make it?
            </h2>
            <p className="text-[17px] leading-relaxed text-lumi-text max-w-[48ch]">
              Make a poll, share the link. Nobody else needs an account: they press
              and drag over the slots they are free, and the page ranks the stretches
              everyone shares and says who is still missing. You pick one, and it
              lands on your calendar like any other event.
            </p>
            <Link
              href={poll}
              data-cursor="open poll"
              data-cursor-tone="blue"
              className="self-start font-semibold text-lumi-accent underline underline-offset-[3px] hover:text-lumi-text"
            >
              See a sample poll →
            </Link>
          </div>
          <PollSketch />
        </section>

        {/* ── How it works ── */}
        <section className="flex flex-col gap-8">
          <Eyebrow>How it works</Eyebrow>
          <ol className="grid grid-cols-1 sm:grid-cols-5 gap-6 sm:gap-4">
            {[
              ["Mail arrives", "Gmail, a forwarded email, or your Handshake feed. All land in the same pipeline."],
              ["Detect", "Free and exact first: a calendar attachment, then page markup. Then a keyword gate and rules before any model call."],
              ["Extract and rank", "One model call per email: every event in it, a 1 to 5 fit against your profile, and one sentence on what it is."],
              ["You decide", "Past events are dropped, duplicates merged, overlaps flagged. Then one question per card."],
              ["On your calendar", "Attend writes it to Google Calendar or your iCal feed. Walking it back removes it."],
            ].map(([title, body], i) => (
              <li key={title} className="flex flex-col gap-2 border-t border-lumi-border pt-4">
                <span className="font-serif font-serif-soft text-[28px] font-light leading-none tracking-[-0.03em] text-[#C9C7C1]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-semibold text-lumi-text">{title}</span>
                <span className="text-sm leading-relaxed text-lumi-muted">{body}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-lumi-muted max-w-[64ch]">
            Most mail never reaches the model at all. Rules that cost nothing
            handle it first.
          </p>
        </section>

        {/* ── Promises ── */}
        <section className="rounded-[20px] bg-lumi-surface px-6 sm:px-10 py-10 sm:py-12 flex flex-col gap-8">
          <h2 className="font-serif font-serif-soft font-medium text-[30px] sm:text-[40px] leading-[1.08] tracking-[-0.025em] text-lumi-text max-w-[22ch]">
            What Lumi never does.
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5 text-[16px] leading-relaxed text-lumi-text">
            <Promise>Puts anything on your calendar without you pressing Attend.</Promise>
            <Promise>Reads Promotions, Social, archived or sent mail. The inbox tab only, and you can narrow it to one label.</Promise>
            <Promise>Asks for your inbox at sign-in. Name and email only; the rest is a separate grant you can revoke.</Promise>
            <Promise>Hides how it works. The code is open source under MIT, including every prompt.</Promise>
          </ul>
        </section>

        {/* ── Close ── */}
        <section className="flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-[24ch] font-serif font-serif-soft text-[28px] sm:text-[34px] leading-[1.18] tracking-[-0.02em] text-lumi-text">
            Built at NYU, for recruiting season. Free while it&rsquo;s small.
          </div>
          <button
            onClick={start}
            data-cursor="let's go"
            data-cursor-tone="mark"
            className="min-h-[50px] rounded-full bg-lumi-text px-6 text-[15px] font-semibold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_10px_24px_-14px_rgba(17,17,17,0.45)] active:scale-[0.98]"
          >
            Sign in with Google →
          </button>
        </section>
      </main>

      <footer className="border-t border-lumi-border">
        <div className="max-w-[1040px] mx-auto px-6 sm:px-10 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-lumi-subtle">
          <span>Lumi · Open source · MIT</span>
          <span className="flex gap-5">
            <a href="https://github.com/anniehyd/Lumi" target="_blank" rel="noreferrer" className="hover:text-lumi-text">
              GitHub
            </a>
            <a
              href="https://github.com/anniehyd/Lumi/blob/main/docs/ARCHITECTURE.md"
              target="_blank"
              rel="noreferrer"
              className="hover:text-lumi-text"
            >
              How it&rsquo;s built
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lumi-subtle">{children}</p>;
}

function Promise({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-[9px] h-[7px] w-[7px] shrink-0 rounded-full bg-lumi-accent" />
      <span>{children}</span>
    </li>
  );
}

function Way({ n, title, body, needs }: { n: string; title: string; body: string; needs: string }) {
  return (
    <div className="bg-lumi-bg p-6 sm:p-7 flex flex-col gap-3 transition-colors hover:bg-[#FAFAF7]">
      <span className="font-serif font-serif-soft text-[40px] font-light leading-none tracking-[-0.04em] text-[#C9C7C1]">{n}</span>
      <h3 className="font-serif font-medium text-[24px] leading-tight tracking-[-0.02em] text-lumi-text">{title}</h3>
      <p className="text-[15px] leading-relaxed text-lumi-text">{body}</p>
      <p className="mt-auto pt-2 text-sm text-lumi-muted">
        <span className="font-semibold text-lumi-text">Needs · </span>
        {needs}
      </p>
    </div>
  );
}

/** Five stars, filled to the relevance score; same drawing as the dashboard. */
function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} of 5 stars for you`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={i <= value ? "text-lumi-text" : "text-[#DDDBD5]"}
          fill="currentColor"
        >
          <path d="M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z" />
        </svg>
      ))}
    </span>
  );
}

/**
 * A static copy of the first demo card, laid out exactly as EventCard draws
 * it. The buttons lead into the demo so pressing one does what it suggests.
 */
function SampleCard({ demo }: { demo: string }) {
  return (
    <article className="grid grid-cols-1 sm:grid-cols-[96px_1fr_auto] gap-y-4 sm:gap-7 items-start rounded-[20px] border border-lumi-border bg-white px-6 py-8 sm:py-9 shadow-[0_24px_60px_-40px_rgba(17,17,17,0.35)]">
      <div
        aria-hidden="true"
        className="font-serif font-serif-soft text-[40px] sm:text-[64px] font-light leading-[0.9] tracking-[-0.04em] -mb-1 sm:mb-0 text-lumi-accent"
      >
        01
      </div>

      <div className="min-w-0 flex flex-col gap-3">
        <Stars value={5} />
        <h3 className="font-serif font-medium leading-[1.06] tracking-[-0.025em] text-lumi-text text-[30px] sm:text-[40px]">
          Coffee Chats with Marshall Wace
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
          <dt className="text-lumi-subtle">When</dt>
          <dd className="font-semibold text-lumi-text tabular-nums">Thu · 12–2 PM</dd>
          <dt className="text-lumi-subtle">Where</dt>
          <dd className="text-lumi-text">
            Interview Room 4 — Wasserman Union Square
            <span className="text-lumi-muted"> · 726 Broadway</span>
          </dd>
          <dt className="text-lumi-subtle">Host</dt>
          <dd className="text-lumi-text">
            Marshall Wace<span className="text-lumi-muted"> · invite via NYU Wasserman Center</span>
          </dd>
        </dl>
        <p className="text-[17px] leading-relaxed text-lumi-text max-w-[62ch]">
          Marshall Wace is a London hedge fund with a large technology team; this coffee
          chat is where their developers talk to students about internships.
        </p>
        <p className="text-[15px]">
          <span className="font-semibold text-lumi-text">RSVP needed · </span>
          <span className="font-semibold text-lumi-accent underline underline-offset-[3px]">mwtech-campus.events</span>
        </p>
        <p className="inline-flex items-center gap-2 self-start rounded-lg bg-[#FFE4E4] px-3 py-1.5 text-[14px] font-semibold text-lumi-rose">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          Overlaps Linear Algebra Recitation on your calendar
        </p>
      </div>

      <div className="flex sm:flex-col flex-wrap gap-2 sm:min-w-[132px]">
        <Link
          href={demo}
          data-cursor="attend?"
          data-cursor-tone="mark"
          className="min-h-[46px] inline-flex items-center justify-center rounded-full bg-lumi-text px-5 text-sm font-semibold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_10px_24px_-14px_rgba(17,17,17,0.45)] active:scale-[0.98]"
        >
          Attend →
        </Link>
        <Link
          href={demo}
          data-cursor="maybe later"
          data-cursor-tone="ink"
          className="min-h-[44px] inline-flex items-center justify-center rounded-full bg-lumi-surface px-5 text-sm font-semibold text-lumi-text transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.03] active:scale-[0.98]"
        >
          Maybe
        </Link>
        <Link
          href={demo}
          data-cursor="skip"
          data-cursor-tone="rose"
          className="min-h-[44px] inline-flex items-center justify-center rounded-full px-5 text-sm font-semibold text-lumi-muted transition-colors hover:text-lumi-rose"
        >
          Skip
        </Link>
      </div>
    </article>
  );
}

/** A small painted grid: three people, the shared stretches highlighted. */
function PollSketch() {
  const days = ["Mon", "Tue", "Wed", "Thu"];
  const hours = ["5 PM", "6 PM", "7 PM", "8 PM"];
  // People free in each cell, hours down and days across; 3 is everyone.
  const free = [
    [1, 2, 3, 2],
    [0, 1, 3, 2],
    [2, 3, 3, 1],
    [1, 3, 2, 1],
  ];
  const tone = ["bg-white", "bg-[#EEF1FF]", "bg-[#C9D3FF]", "bg-lumi-accent"];
  return (
    <div className="rounded-[20px] border border-lumi-border bg-white p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-serif font-medium text-[20px] tracking-[-0.02em] text-lumi-text">Study group, next week</span>
        <span className="text-xs text-lumi-muted">3 of 4 answered</span>
      </div>
      <div className="grid grid-cols-[44px_repeat(4,1fr)] gap-1 text-[11px] text-lumi-subtle">
        <span />
        {days.map((d) => (
          <span key={d} className="text-center font-semibold text-lumi-muted">
            {d}
          </span>
        ))}
        {hours.map((h, r) => (
          <div key={h} className="contents">
            <span className="self-center">{h}</span>
            {days.map((d, c) => (
              <span
                key={d}
                aria-label={`${d} ${h}: ${free[r][c]} free`}
                className={`h-8 rounded-md border border-lumi-border ${tone[free[r][c]]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="font-semibold text-lumi-text">Wed 5–8 PM</dt>
          <dd className="text-lumi-muted">everyone who answered</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="font-semibold text-lumi-text">Tue 7–9 PM</dt>
          <dd className="text-lumi-muted">everyone who answered</dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-lumi-subtle">
          <dt>Still waiting on</dt>
          <dd>Priya</dd>
        </div>
      </dl>
    </div>
  );
}
