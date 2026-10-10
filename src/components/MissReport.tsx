"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, MailQuestion, X } from "lucide-react";

/**
 * The recall control. Accept/decline tells us whether what Lumi surfaced was
 * good; nothing tells us what Lumi never surfaced at all. One tap, one line of
 * text, stored against the user for the weekly read.
 */
export function MissReport() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function submit() {
    if (!note.trim()) return;
    setState("saving");
    try {
      const res = await fetch("/api/miss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error();
      setState("done");
      setNote("");
      setTimeout(() => {
        setOpen(false);
        setState("idle");
      }, 1400);
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-lumi-subtle hover:text-lumi-muted transition-colors"
      >
        <MailQuestion className="w-3.5 h-3.5" />
        Lumi missed something
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
            onClick={() => state !== "saving" && setOpen(false)}
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl bg-lumi-surface border border-lumi-border p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-serif text-xl text-lumi-text">What did we miss?</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-lumi-subtle hover:text-lumi-text transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {state === "done" ? (
                <div className="flex items-center gap-2 py-6 justify-center text-sm text-lumi-green">
                  <Check className="w-4 h-4" />
                  Logged — thank you.
                </div>
              ) : (
                <>
                  <p className="text-xs text-lumi-muted mb-3 leading-relaxed">
                    An event you went to, or wish you had, that Lumi never showed you.
                    Rough detail is fine — the sender or the name is enough.
                  </p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="The Jane Street info session on the 20th — it came from the SEA mailing list."
                    className="w-full rounded-lg bg-lumi-bg border border-lumi-border px-3 py-2 text-sm text-lumi-text placeholder:text-lumi-subtle focus:border-lumi-accent focus:outline-none resize-none mb-3"
                  />
                  {state === "error" && (
                    <p className="text-xs text-lumi-rose mb-3">
                      Couldn&apos;t save that. Try again?
                    </p>
                  )}
                  <button
                    onClick={submit}
                    disabled={!note.trim() || state === "saving"}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-lumi-accent px-4 py-2.5 text-sm font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {state === "saving" && <Loader2 className="w-4 h-4 animate-spin" />}
                    Send
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
