import React from "react";
import { StatCardProps } from "./StatCard";

/**
 * The five kinds of figure a console screen can show.
 *
 * Every strip is built from these, so the same meaning always gets the same
 * colour and the same icon. Written by hand, the sixth page always drifts: our
 * Plans screen painted a healthy count blue and Staff had no icons at all.
 *
 *   total  grey   what there is
 *   good   green  what is healthy
 *   wait   blue   what is in progress
 *   risk   red    what needs chasing, grey when there is none
 *   money  gold   an amount
 */

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M6.5 5.5h11M6.5 10h11M6.5 14.5h11M3 5.5h.01M3 10h.01M3 14.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3.5 10.5 8 15l8.5-9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 3.5 17.5 16.5h-15L10 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8.5v3M10 14h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.5" y="5" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

type Bare = { label: string; value: string | number; note?: string; href?: string };

export function statTotal({ label, value, note, href }: Bare): StatCardProps {
  return { label, value, note, href, icon: <ListIcon />, tone: "plain" };
}

export function statGood({ label, value, note, href }: Bare): StatCardProps {
  return { label, value, note, href, icon: <TickIcon />, tone: "good" };
}

export function statWait({ label, value, note, href }: Bare): StatCardProps {
  return { label, value, note, href, icon: <ClockIcon />, tone: "info" };
}

/** Red only when there is something to chase; a red zero cries wolf. */
export function statRisk({ label, value, note, href }: Bare): StatCardProps {
  const nothing = value === 0 || value === "0" || value === "—";
  return { label, value, note, href, icon: <AlertIcon />, tone: nothing ? "plain" : "warn" };
}

export function statMoney({ label, value, note, href }: Bare): StatCardProps {
  return { label, value, note, href, icon: <MoneyIcon />, tone: "gold" };
}
