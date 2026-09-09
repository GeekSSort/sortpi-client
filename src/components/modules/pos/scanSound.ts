"use client";

import { useSyncExternalStore } from "react";

/**
 * How loud the scanner beeps, on THIS till.
 *
 * Per device, not per company, because the right level is a property of the
 * counter it stands on: a shop floor with a fridge, a fan and a queue needs
 * more than an office desk, and the same organisation has both. Storing it on
 * the shop would make one of them wrong on purpose.
 *
 * The default reproduces the levels the till shipped with, so nobody who never
 * opens this control hears any change. Above the default it is genuinely
 * louder than before; at zero the tone is not produced at all rather than
 * played silently, which also saves waking the audio hardware on every scan.
 */

const KEY = "sp_scan_volume";

/**
 * The point the scale is built around: at exactly this value the tone is the
 * amplitude the till used to have, fixed. It is the REFERENCE, not the
 * starting position — below it the beep is quieter than it ever was, above it
 * the saturation chain in `beep` is engaged and it gets much louder.
 */
export const SHIPPED_VOLUME = 0.35;

/**
 * Where the slider starts on a till that has never been adjusted: the top.
 *
 * A scanner beep exists to be heard without looking, across a counter, over a
 * fridge and a queue. Shipping it quiet and hoping somebody finds the control
 * gets the one thing it is for wrong by default. Anybody who wants it softer
 * has a slider, and the control is the first thing in the Scanner panel.
 */
export const DEFAULT_VOLUME = 1;

/**
 * The amplitude of each tone at `SHIPPED_VOLUME` — the levels the till used to
 * have, fixed. Past the default the oscillator does NOT keep climbing (there
 * is no headroom left above 1.0 and pushing into it is just clipping); the
 * extra loudness comes from `useBarcodeScanner.beep` stacking partials and
 * driving a compressor, which is what makes the top of this scale several
 * times louder rather than marginally so.
 */
export const BEEP_GAIN = 0.5;
export const ERROR_GAIN = 0.7;

/**
 * How hard the top of the slider drives the compressor's makeup gain.
 *
 * `volume / SHIPPED_VOLUME`, so 1.0 on the slider is this many times the
 * default drive. With three stacked partials and the compressor holding the
 * peaks, that is a large real increase — not the fraction of a decibel raising
 * a single square wave from 0.7 to 1.0 would have bought.
 */
export function drive(volume: number): number {
  return volume / SHIPPED_VOLUME;
}

let cached: number | null = null;
const listeners = new Set<() => void>();

function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}

/** 0 to 1. Reads storage once and remembers, because `beep` runs per scan. */
export function scanVolume(): number {
  if (cached !== null) return cached;
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const stored = window.localStorage.getItem(KEY);
    cached = stored === null ? DEFAULT_VOLUME : clamp(Number(stored));
  } catch {
    // Private mode, or site data blocked. The default is a working till.
    cached = DEFAULT_VOLUME;
  }
  return cached;
}

export function setScanVolume(value: number): void {
  cached = clamp(value);
  try {
    window.localStorage.setItem(KEY, String(cached));
  } catch {
    // Not storable here; it still applies for this session.
  }
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/**
 * The volume, as a hook.
 *
 * `useSyncExternalStore` rather than state plus an effect: the value lives
 * outside React (it is read by `beep`, which is not a component), and setting
 * state in an effect is both a cascading render and a lint error in this
 * codebase. The server snapshot is the default, so the first paint matches.
 */
export function useScanVolume(): number {
  return useSyncExternalStore(subscribe, scanVolume, () => DEFAULT_VOLUME);
}
