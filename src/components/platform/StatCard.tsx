"use client";

import React from "react";
import Link from "next/link";

/**
 * A figure on the console.
 *
 * One card, used on the dashboard and above every list. When it names
 * something you would want to look at, it takes an `href` and becomes a link —
 * a number that answers "who?" should be able to show you who.
 */

export interface StatCardProps {
  label: string;
  value: string | number;
  /** A quiet second line: "of 20", "this month". */
  note?: string;
  /** Makes the card a link. */
  href?: string;
  icon?: React.ReactNode;
  /** Paints the figure. Gold is money; the rest carry their own meaning. */
  tone?: "plain" | "gold" | "good" | "info" | "warn";
}

const VALUE_TONE = {
  plain: "text-[#1e1e1e]",
  gold: "text-[#f5b800]",
  good: "text-[#00963b]",
  info: "text-[#2563eb]",
  warn: "text-[#e63946]",
};

/** The icon chip follows the figure, so the card reads as one colour. */
const ICON_TONE = {
  plain: "bg-[#f5f4f1] text-[#525252] group-hover:bg-[#525252] group-hover:text-white",
  gold: "bg-[#fdf7e6] text-[#f5b800] group-hover:bg-[#f5b800] group-hover:text-white",
  good: "bg-[#e8f7ee] text-[#00963b] group-hover:bg-[#00963b] group-hover:text-white",
  info: "bg-[#e8f0fe] text-[#2563eb] group-hover:bg-[#2563eb] group-hover:text-white",
  warn: "bg-[#fdeaec] text-[#e63946] group-hover:bg-[#e63946] group-hover:text-white",
};

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StatCard({ label, value, note, href, icon, tone = "plain" }: StatCardProps) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-[8px]">
        <span className="text-[11px] tracking-[0.08em] text-[#8f8d87] uppercase">{label}</span>
        {icon && (
          <span className={`flex size-[32px] shrink-0 items-center justify-center rounded-[8px] transition-colors duration-200 ${ICON_TONE[tone]}`}>
            {icon}
          </span>
        )}
      </span>
      <span className={`text-[26px] leading-[1.15] font-semibold tracking-[-0.5px] tabular-nums ${VALUE_TONE[tone]}`}>
        {value}
      </span>
      <span className="flex items-center gap-[4px] text-[12px] text-[#525252]">
        {note}
        {href && (
          <span className="ml-auto flex items-center gap-[2px] text-[#f5b800] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            View
            <ArrowIcon />
          </span>
        )}
      </span>
    </>
  );

  // -1px of lift and a gold edge on hover; the same movement the shop cards use.
  const shell =
    "group flex flex-col gap-[6px] rounded-[12px] bg-white px-[16px] py-[14px] shadow-[inset_0_0_0_1px_#eaeaea] transition-all duration-200 hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_#f5b800,0_6px_20px_rgba(245,184,0,0.12)]";

  return href ? (
    <Link href={href} className={`${shell} cursor-pointer`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
