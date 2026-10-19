"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Nav } from "@/components/Nav";
import { StarCursor } from "@/components/StarCursor";
import { formatClock, formatDay, validatePollInput } from "@/lib/meet";

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The next 14 days, starting tomorrow. Next Mon–Fri are on by default. */
function upcoming(): { day: string; weekday: number }[] {
  const out: { day: string; weekday: number }[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    out.push({ day: isoDay(d), weekday: d.getDay() });
  }
  return out;
}

const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i); // 6 AM – 10 PM

export default function NewPollPage() {
  const router = useRouter();
  const days = useMemo(upcoming, []);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", []);

  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => {
    // First Monday from tomorrow, through that Friday.
    const first = days.findIndex((d) => d.weekday === 1);
    const week = first >= 0 ? days.slice(first, first + 5) : days.slice(0, 5);
    return new Set(week.filter((d) => d.weekday >= 1 && d.weekday <= 5).map((d) => d.day));
  });
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(21);
  const [slotMinutes, setSlotMinutes] = useState(30);

  const input = {
    title,
    days: [...picked].sort(),
    dayStart: startHour * 60,
    dayEnd: endHour * 60,
    slotMinutes,
    timezone,
  };
  const problem = validatePollInput(input);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/meet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
      if (!res.ok || !body.slug) throw new Error(body.error ?? `failed (${res.status})`);
      return body.slug;
    },
    onSuccess: (slug) => router.push(`/meet/${slug}`),
  });

  const toggle = (day: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(day)) n.delete(day);
      else n.add(day);
      return n;
    });

  return (
    <div className="lumi-custom-cursor min-h-screen flex flex-col bg-lumi-bg">
      <StarCursor />
      <Nav />

      <main className="flex-1 w-full max-w-[880px] mx-auto px-6 sm:px-10 pt-10 sm:pt-16 pb-24 flex flex-col gap-12">
        <section className="flex flex-col gap-4">
          <p className="animate-rise [animation-delay:80ms] inline-flex items-center gap-2.5 text-sm text-lumi-muted">
            <span className="w-2 h-2 rounded-full bg-lumi-accent" />
            A link for the group. Nobody else needs an account.
          </p>
          <h1 className="animate-rise [animation-delay:200ms] font-serif text-[48px] sm:text-[72px] font-normal leading-[0.98] tracking-[-0.03em] text-lumi-text">
            When can <span className="italic font-medium">everyone</span> make it?
          </h1>
        </section>

        <form
          className="animate-rise [animation-delay:320ms] flex flex-col gap-10"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) create.mutate();
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-lumi-text">What is it for?</span>
            <input
              id="meet-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Algorithms study group before the midterm"
              maxLength={120}
              className="min-h-[52px] rounded-2xl bg-lumi-surface border-[1.5px] border-transparent px-5 text-[17px] text-lumi-text placeholder:text-lumi-subtle focus:border-lumi-text focus:outline-none"
            />
          </label>

          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[15px] font-semibold text-lumi-text">Which days?</span>
              <span className="text-sm text-lumi-muted">{picked.size} picked</span>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map(({ day, weekday }) => {
                const on = picked.has(day);
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggle(day)}
                    aria-pressed={on}
                    data-cursor={on ? "drop it" : "add it"}
                    data-cursor-tone={on ? "ink" : "mark"}
                    className={`flex flex-col items-center gap-0.5 rounded-2xl py-3 border-[1.5px] transition-colors ${
                      on
                        ? "bg-lumi-text text-white border-lumi-text"
                        : "bg-white text-lumi-text border-lumi-border hover:border-lumi-text"
                    } ${weekday === 0 || weekday === 6 ? "opacity-80" : ""}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-70">
                      {formatDay(day).split(",")[0]}
                    </span>
                    <span className="font-serif font-serif-soft text-[22px] leading-none">{parseInt(day.slice(8), 10)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Field label="From">
              <Select id="meet-start" value={startHour} onChange={setStartHour}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatClock(h * 60)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Until">
              <Select id="meet-end" value={endHour} onChange={setEndHour}>
                {HOURS.filter((h) => h > startHour).map((h) => (
                  <option key={h} value={h}>
                    {formatClock(h * 60)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Slots">
              <Select id="meet-slot" value={slotMinutes} onChange={setSlotMinutes}>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={Boolean(problem) || create.isPending}
              data-cursor="make the link"
              data-cursor-tone="mark"
              className="inline-flex items-center gap-2 min-h-[52px] rounded-full bg-lumi-text px-7 text-[15px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create the poll →
            </button>
            <span className="text-sm text-lumi-muted">
              {create.isError
                ? (create.error as Error).message
                : problem && title
                  ? problem
                  : `Times in ${timezone.replace("_", " ")}.`}
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[15px] font-semibold text-lumi-text">{label}</span>
      {children}
    </label>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="min-h-[48px] rounded-full bg-lumi-surface border-[1.5px] border-transparent px-5 text-[15px] text-lumi-text focus:border-lumi-text focus:outline-none"
    >
      {children}
    </select>
  );
}
