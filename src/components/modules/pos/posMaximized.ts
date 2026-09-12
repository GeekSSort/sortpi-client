"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the till is running maximized — the back office's frame hidden.
 *
 * /pos has two frames (see the (pos) layout): a cashier gets PosRail and
 * PosHead and already owns the window, and everyone with a back office gets
 * the dashboard's sidebar and header with the till as a page inside them. On a
 * 1366-wide laptop that frame costs the product wall about 260px of width and
 * the tiles drop a column, which is the difference between a shelf a cashier
 * scans and one they scroll.
 *
 * So a back-office user can put the till full-window. The control sits ON the
 * page rather than in the header, because the header is the thing it hides —
 * a switch that removes its own housing cannot be used to switch back.
 *
 * Kept per device, like the column choice in posView.ts: a manager who works
 * the till from the same terminal every morning should not re-maximize it
 * every morning.
 */

const KEY = "sp_pos_max";

// Off by default. The till opens in the back office's frame, with the switch
// resting in the header beside the column switcher; full screen is something
// the user asks for, and then it is remembered.
const DEFAULT = false;

let current: boolean = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved === null ? DEFAULT : saved === "1";
  } catch {
    // A browser that refuses storage still gets the default.
    return DEFAULT;
  }
}

function subscribe(listener: () => void): () => void {
  // Read on the first subscribe, not while rendering: the server has no
  // localStorage, and reading it during a render would make the two disagree.
  if (!loaded) {
    loaded = true;
    const saved = read();
    if (saved !== current) {
      current = saved;
      queueMicrotask(() => listeners.forEach((l) => l()));
    }
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPosMaximized(next: boolean): void {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // The choice just will not survive a reload.
  }
  listeners.forEach((l) => l());
}

export function togglePosMaximized(): void {
  setPosMaximized(!current);
}

export function usePosMaximized(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => current,
    // The server always renders the default, so the first paint matches.
    () => DEFAULT
  );
}
