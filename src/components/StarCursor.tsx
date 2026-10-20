"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The dashboard's cursor: a slowly turning star with a soft blob trailing it.
 * Hovering anything with `data-cursor="attend?"` shows that word next to the
 * star and tints the blob (`data-cursor-tone`: mark | ink | blue | rose).
 *
 * Position updates go straight to the DOM from one mousemove listener, so
 * React never re-renders on movement. Mounted only where `.lumi-custom-cursor`
 * is on the page; globals.css hides the native cursor there for mouse users
 * who have not asked for reduced motion, and this component stays inert for
 * everyone else.
 */
const TONES: Record<string, { blob: string; star: string }> = {
  mark: { blob: "#F5E663", star: "#111111" },
  ink: { blob: "#EDEBE5", star: "#6B6B6B" },
  blue: { blob: "#DCE3FF", star: "#2B4BFF" },
  rose: { blob: "#FFE4E4", star: "#9A2E2E" },
};
const IDLE = { blob: "#F5E663", star: "#2B4BFF" };

export function StarCursor() {
  const star = useRef<HTMLDivElement>(null);
  const blob = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState("");
  const [tone, setTone] = useState(IDLE);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let x = -100;
    let y = -100;

    const paint = () => {
      raf = 0;
      if (star.current) star.current.style.transform = `translate(${x}px, ${y}px)`;
      if (blob.current) blob.current.style.transform = `translate(${x}px, ${y}px)`;
    };
    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      setVisible(true);
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cursor]");
      if (target) {
        setLabel(target.dataset.cursor ?? "");
        setTone(TONES[target.dataset.cursorTone ?? ""] ?? TONES.mark);
      } else {
        setLabel("");
        setTone(IDLE);
      }
    };
    const onLeave = () => setVisible(false);

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  const hot = label.length > 0;
  const size = hot ? 104 : 44;

  return (
    <>
      <div
        ref={blob}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[60] rounded-full mix-blend-multiply transition-[width,height,margin,background-color,opacity] duration-300 ease-out"
        style={{
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          background: tone.blob,
          opacity: visible ? 0.85 : 0,
          willChange: "transform",
        }}
      />
      <div
        ref={star}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[61] transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0, willChange: "transform" }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          className="-ml-[13px] -mt-[13px] block animate-spin-slow transition-colors duration-300"
          style={{ color: tone.star }}
          fill="currentColor"
        >
          <path d="M12 1.5c.9 5.4 4.1 8.6 10.5 10.5-6.4 1.9-9.6 5.1-10.5 10.5C11.1 17.1 7.9 13.9 1.5 12 7.9 10.1 11.1 6.9 12 1.5z" />
        </svg>
        <span
          className="absolute left-[18px] top-[10px] whitespace-nowrap rounded-full bg-lumi-text px-2.5 py-1 text-xs font-bold text-white transition-all duration-200"
          style={{ opacity: hot ? 1 : 0, transform: hot ? "translateY(0)" : "translateY(6px)" }}
        >
          {label}
        </span>
      </div>
    </>
  );
}
