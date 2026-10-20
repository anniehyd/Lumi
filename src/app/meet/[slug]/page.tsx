"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Nav } from "@/components/Nav";
import { StarCursor } from "@/components/StarCursor";
import { MeetGrid } from "@/components/MeetGrid";
import {
  formatClock,
  formatDay,
  formatRange,
  googleCalendarUrl,
  headline,
  parseKey,
  stillWaiting,
  tally,
  type BestTime,
  type Poll,
  type Response,
} from "@/lib/meet";

type PollPayload = { poll: Poll; responses: Response[]; best: BestTime[]; viewerIsOwner: boolean };

function storageKey(slug: string) {
  return `lumi-meet:${slug}`;
}
function readIdentity(slug: string): { name: string; editToken: string } | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as { name: string; editToken: string }) : null;
  } catch {
    return null;
  }
}
function writeIdentity(slug: string, id: { name: string; editToken: string }) {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(id));
  } catch {
    // Private window or blocked storage: the answer still saves, you just
    // have to retype your name next time.
  }
}

export default function PollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["meet", slug],
    queryFn: async () => {
      const res = await fetch(`/api/meet/${slug}`);
      if (!res.ok) throw new Error("not found");
      return (await res.json()) as PollPayload;
    },
    refetchInterval: 20_000,
  });

  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nudged, setNudged] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Remember who I am on this poll and pre-load my earlier answer.
  useEffect(() => {
    if (!data || loadedFor === slug) return;
    const id = readIdentity(slug);
    if (id) {
      setName(id.name);
      setToken(id.editToken);
      const mine = data.responses.find((r) => r.name === id.name);
      if (mine) setSelected(new Set(mine.slots));
    }
    setLoadedFor(slug);
  }, [data, slug, loadedFor]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meet/${slug}/respond`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slots: [...selected], editToken: token }),
      });
      const body = (await res.json().catch(() => ({}))) as { editToken?: string; name?: string; error?: string };
      if (!res.ok || !body.editToken) throw new Error(body.error ?? `failed (${res.status})`);
      return body as { editToken: string; name: string };
    },
    onSuccess: (r) => {
      setToken(r.editToken);
      setName(r.name);
      setDirty(false);
      writeIdentity(slug, { name: r.name, editToken: r.editToken });
      qc.invalidateQueries({ queryKey: ["meet", slug] });
    },
  });

  const pick = useMutation({
    mutationFn: async (range: { start: string; end: string } | null) => {
      const res = await fetch(`/api/meet/${slug}/final`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(range ?? { start: null }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; calendar?: string };
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meet", slug] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const counts = useMemo(() => (data ? tally(data.responses) : new Map<string, string[]>()), [data]);
  const total = data?.responses.length ?? 0;
  const expected = data?.poll.expected ?? [];
  const waiting = useMemo(() => (data ? stillWaiting(data.poll.expected, data.responses) : []), [data]);
  const brief = useMemo(() => (data ? headline(data.best, total, waiting.length) : null), [data, total, waiting.length]);
  const final = data?.poll.finalStart && data.poll.finalEnd ? { start: data.poll.finalStart, end: data.poll.finalEnd } : null;
  // Built in the browser so the link carries this page's own address.
  const googleUrl = data && final ? googleCalendarUrl(data.poll, typeof window === "undefined" ? undefined : window.location.href) : null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the URL bar is right there.
    }
  }

  if (isError) {
    return (
      <div className="min-h-screen flex flex-col bg-lumi-bg">
        <Nav />
        <main className="flex-1 w-full max-w-[880px] mx-auto px-6 sm:px-10 pt-16 flex flex-col gap-4">
          <h1 className="font-serif text-[48px] leading-[1] tracking-[-0.03em]">That poll doesn’t exist.</h1>
          <p className="text-lumi-muted">
            Check the link, or <Link href="/meet/new">start a new one</Link>.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="lumi-custom-cursor min-h-screen flex flex-col bg-lumi-bg">
      <StarCursor />
      <Nav />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 sm:px-10 pt-10 sm:pt-14 pb-24 flex flex-col gap-12">
        <section className="flex flex-col gap-4">
          <p className="animate-rise [animation-delay:80ms] flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-lumi-muted">
            <span className="inline-flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-lumi-accent" />
              {isLoading ? "Loading…" : `${total} answer${total === 1 ? "" : "s"} · times in ${data?.poll.timezone.replace("_", " ")}`}
            </span>
            <button
              onClick={copyLink}
              data-cursor="copy link"
              data-cursor-tone="blue"
              className="inline-flex items-center gap-1.5 rounded-full bg-lumi-surface px-3 py-1.5 text-xs font-semibold text-lumi-text hover:bg-lumi-surface-hover transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-lumi-green" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy the link for the group"}
            </button>
          </p>
          <h1 className="animate-rise [animation-delay:200ms] font-serif text-[36px] sm:text-[52px] font-normal leading-[1] tracking-[-0.03em] text-lumi-text max-w-[18ch]">
            {data?.poll.title ?? " "}
          </h1>
          {brief && (
            <p className="animate-rise [animation-delay:320ms] text-lg sm:text-xl leading-[1.45] text-[#4A4A4A] max-w-[46ch]">
              <Emph text={brief.text} word={brief.emphasis} />
            </p>
          )}
          {final && data && (
            <div className="animate-rise [animation-delay:400ms] flex flex-wrap items-center gap-3">
              <div className="inline-flex flex-wrap items-center gap-3 rounded-2xl bg-lumi-mark px-5 py-3 text-[15px] font-semibold text-lumi-text">
                Picked: {formatRange({ day: parseKey(final.start)!.day, start: final.start, end: final.end })}
                {data.viewerIsOwner && (
                  <button
                    onClick={() => pick.mutate(null)}
                    className="text-sm font-semibold underline underline-offset-[3px] opacity-70 hover:opacity-100"
                  >
                    undo
                  </button>
                )}
              </div>
              <a
                href={`/api/meet/${slug}/final.ics`}
                download={`${slug}.ics`}
                data-cursor="add to calendar"
                data-cursor-tone="mark"
                className="inline-flex items-center gap-2 min-h-[44px] rounded-full bg-lumi-text px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                <CalendarPlus className="w-4 h-4" />
                Add to my calendar
              </a>
              {googleUrl && (
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="open google"
                  data-cursor-tone="blue"
                  className="inline-flex items-center gap-2 min-h-[44px] rounded-full border-[1.5px] border-lumi-text bg-white px-5 text-sm font-semibold text-lumi-text transition-transform hover:-translate-y-0.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  Google Calendar
                </a>
              )}
            </div>
          )}
        </section>

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 lg:gap-16 items-start">
            <section className="flex flex-col gap-5 min-w-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em]">Your free time</h2>
                <span className="text-sm text-lumi-muted">press and drag</span>
              </div>
              <input
                id="meet-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                placeholder="Your name"
                maxLength={40}
                className="min-h-[48px] rounded-full bg-lumi-surface border-[1.5px] border-transparent px-5 text-[15px] text-lumi-text placeholder:text-lumi-subtle focus:border-lumi-text focus:outline-none"
              />
              <MeetGrid
                mode="paint"
                poll={data.poll}
                selected={selected}
                highlight={final}
                onChange={(next) => {
                  setSelected(next);
                  setDirty(true);
                }}
              />
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => save.mutate()}
                  disabled={!name.trim() || save.isPending || !dirty}
                  data-cursor="save mine"
                  data-cursor-tone="mark"
                  className="inline-flex items-center gap-2 min-h-[48px] rounded-full bg-lumi-text px-6 text-[15px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                >
                  {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {token ? "Update my answer" : "Save my answer"}
                </button>
                <span className="text-sm text-lumi-muted">
                  {save.isError
                    ? (save.error as Error).message
                    : save.isSuccess && !dirty
                      ? "Saved. Come back any time from this browser to change it."
                      : `${selected.size} slot${selected.size === 1 ? "" : "s"} marked`}
                </span>
              </div>
            </section>

            <section className="flex flex-col gap-5 min-w-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em]">Everyone</h2>
                <span className="text-sm text-lumi-muted min-h-[20px]">
                  {hoverKey
                    ? (() => {
                        const who = counts.get(hoverKey) ?? [];
                        const k = parseKey(hoverKey)!;
                        return `${formatDay(k.day).split(",")[0]} ${formatClock(k.minutes)} · ${
                          who.length ? who.join(", ") : "nobody"
                        }`;
                      })()
                    : total
                      ? data.responses.map((r) => r.name).join(", ")
                      : "Share the link to fill this in"}
                </span>
              </div>
              {expected.length > 0 && (
                <p className="text-sm text-lumi-muted -mt-2">
                  {waiting.length === 0 ? (
                    <>Everyone on the list has answered.</>
                  ) : (
                    <>
                      Still waiting on: <span className="font-semibold text-lumi-text">{waiting.join(", ")}</span>
                      {" "}
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              `Hey ${waiting.join(", ")} — can you mark when you're free for "${data.poll.title}"? ${window.location.href}`
                            );
                            setNudged(true);
                            setTimeout(() => setNudged(false), 1500);
                          } catch {
                            // Clipboard blocked; the names are right there to type.
                          }
                        }}
                        data-cursor="nudge them"
                        data-cursor-tone="blue"
                        className="ml-1 rounded-full bg-lumi-surface px-2.5 py-1 text-xs font-semibold text-lumi-text hover:bg-lumi-surface-hover transition-colors"
                      >
                        {nudged ? "Copied" : "Copy a nudge"}
                      </button>
                    </>
                  )}
                </p>
              )}
              <MeetGrid mode="heat" poll={data.poll} tally={counts} total={total} highlight={final} onHover={setHoverKey} />

              <div className="flex flex-col gap-3 pt-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-lumi-subtle">Best times</h3>
                {data.best.length === 0 ? (
                  <p className="text-sm text-lumi-muted">Nothing in common yet.</p>
                ) : (
                  <ol className="flex flex-col divide-y divide-lumi-border border-t border-b border-lumi-border">
                    {data.best.map((t, i) => (
                      <li key={`${t.start}-${t.end}-${t.count}`} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3.5">
                        <span className="font-serif font-serif-soft text-[26px] font-light leading-none text-[#C9C7C1] w-8 tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 min-w-[200px]">
                          <span className="block font-semibold text-[15px]">{formatRange(t)}</span>
                          <span className="block text-sm text-lumi-muted">
                            {t.count === total ? "everyone" : `${t.count} of ${total}`}
                            {t.missing.length > 0 && t.missing.length <= 3 && ` · missing ${t.missing.join(", ")}`}
                          </span>
                        </span>
                        {data.viewerIsOwner && (
                          <button
                            onClick={() => pick.mutate({ start: t.start, end: t.end })}
                            disabled={pick.isPending}
                            data-cursor="lock it in"
                            data-cursor-tone="mark"
                            className={`min-h-[40px] rounded-full px-4 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-40 ${
                              i === 0 ? "bg-lumi-text text-white" : "border-[1.5px] border-lumi-text bg-white text-lumi-text"
                            }`}
                          >
                            Pick this
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {pick.isError && <p className="text-sm text-lumi-rose">{(pick.error as Error).message}</p>}
                {pick.isSuccess && pick.data.calendar === "synced" && (
                  <p className="text-sm text-lumi-muted">Added to your Google Calendar.</p>
                )}
              </div>
            </section>
          </div>
        )}

        <p className="text-xs text-lumi-subtle">
          Only the person who made the poll can pick the time. Your answer is tied to this browser; to edit it elsewhere, use the same name.
        </p>
      </main>
    </div>
  );
}

function Emph({ text, word }: { text: string; word: string }) {
  const at = text.indexOf(word);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="relative inline-block italic font-medium text-lumi-text">
        <span aria-hidden="true" className="animate-mark absolute -left-0.5 -right-1 bottom-[3px] h-[36%] rounded bg-lumi-mark origin-left" />
        <span className="relative">{word}</span>
      </span>
      {text.slice(at + word.length)}
    </>
  );
}
