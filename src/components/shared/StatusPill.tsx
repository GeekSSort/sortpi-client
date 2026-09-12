import React from "react";

/**
 * The pill used for row status across the app (Figma 30:16980, 45:3783).
 *
 * Three colours per state, not two: a very light ground, a TEXT colour dark
 * enough to read on it, and a tinted ring that gives the chip an edge on a
 * white row.
 *
 * The text used to be the same colour as the dot, which is what a design hands
 * over — a dot is a blob of colour and reads at any lightness, and 12px letters
 * do not. "Due" in #f5b800 on #fffbee was roughly 1.7:1, invisible on a laptop
 * screen at arm's length across a counter; green and orange were little better.
 * The dot keeps the saturated colour it always had, because that is what makes
 * a column of pills scannable, and the label is now a darkened version of the
 * same hue at 4.5:1 or better. Same hues, same meaning, legible.
 */
export const TONES = {
  green: { bg: "#e7f8ed", fg: "#15803d", dot: "#22c55e", ring: "#bbebcb" },
  amber: { bg: "#fef4e0", fg: "#92600e", dot: "#f0a623", ring: "#f5dfae" },
  slate: { bg: "#f1f5f9", fg: "#475569", dot: "#94a3b8", ring: "#dbe3ec" },
  orange: { bg: "#fff1e6", fg: "#b4530d", dot: "#fe954d", ring: "#ffd6b8" },
  red: { bg: "#fdeaea", fg: "#c62828", dot: "#ef4444", ring: "#f7c6c6" },
  mint: { bg: "#e8fbf0", fg: "#047857", dot: "#00b837", ring: "#b9eed2" },
  gold: { bg: "#fff8e1", fg: "#8a6200", dot: "#f5b800", ring: "#f2e0a8" },
  rose: { bg: "#ffe8ea", fg: "#b81f2c", dot: "#e63946", ring: "#ffc4ca" },
} as const;

export type Tone = keyof typeof TONES;

export default function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const c = TONES[tone] ?? TONES.slate;
  return (
    <span
      // `inset` ring rather than a border: a border would add a pixel to the
      // height and the pills sit in 54px rows measured to the pixel.
      className="inline-flex h-[26px] shrink-0 items-center gap-[6px] overflow-clip rounded-full px-[10px]"
      style={{ backgroundColor: c.bg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
    >
      <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: c.dot }} />
      <span
        className="text-[12px] leading-none font-semibold tracking-[-0.12px] whitespace-nowrap"
        style={{ color: c.fg }}
      >
        {label}
      </span>
    </span>
  );
}
