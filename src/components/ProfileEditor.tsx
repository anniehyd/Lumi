"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { ROLES, INTERESTS, DEFAULT_PROFILE, type UserProfile } from "@/lib/profile";

/**
 * Edit the interest profile after onboarding.
 *
 * Saves without `complete`, so onboardedAt is never re-stamped and the
 * onboarding flow stays gone. Changes apply to the next sweep — already-scored
 * events keep the relevance they were given.
 */
export function ProfileEditor() {
  const qc = useQueryClient();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as { profile: UserProfile | null; onboarded: boolean };
    },
  });

  useEffect(() => {
    if (data && !profile) setProfile(data.profile ?? DEFAULT_PROFILE);
  }, [data, profile]);

  if (!profile) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-lumi-subtle">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading your profile…
      </div>
    );
  }

  const toggle = (i: string) =>
    setProfile({
      ...profile,
      interests: profile.interests.includes(i)
        ? profile.interests.filter((x) => x !== i)
        : [...profile.interests, i],
    });

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["profile"] });
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="space-y-5 py-1">
      <p className="text-xs text-lumi-muted leading-relaxed">
        Lumi scores every event it finds from 1 to 5 against this. Changes take
        effect on the next scan.
      </p>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-2">
          You are
        </label>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setProfile({ ...profile, role: r.id })}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
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
        <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-2">
          Never let me miss
        </label>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
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
          <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-1.5">
            School
          </label>
          <input
            value={profile.school ?? ""}
            onChange={(e) => setProfile({ ...profile, school: e.target.value })}
            className="w-full rounded-lg bg-lumi-bg border border-lumi-border px-3 py-1.5 text-sm text-lumi-text focus:border-lumi-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-1.5">
            Graduating
          </label>
          <input
            value={profile.gradYear ?? ""}
            onChange={(e) => setProfile({ ...profile, gradYear: e.target.value })}
            className="w-full rounded-lg bg-lumi-bg border border-lumi-border px-3 py-1.5 text-sm text-lumi-text focus:border-lumi-accent focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-lumi-subtle mb-1.5">
          In your own words
        </label>
        <textarea
          value={profile.note ?? ""}
          onChange={(e) => setProfile({ ...profile, note: e.target.value })}
          rows={3}
          className="w-full rounded-lg bg-lumi-bg border border-lumi-border px-3 py-2 text-sm text-lumi-text focus:border-lumi-accent focus:outline-none resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={state === "saving"}
          className="inline-flex items-center gap-2 rounded-lg bg-lumi-accent px-4 py-2 text-xs font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors disabled:opacity-40"
        >
          {state === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save preferences
        </button>
        {state === "saved" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-lumi-green">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        )}
        {state === "error" && (
          <span className="text-xs text-lumi-rose">Couldn&apos;t save. Try again?</span>
        )}
      </div>
    </div>
  );
}
