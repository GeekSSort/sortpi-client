"use client";

import { useSyncExternalStore } from "react";

/**
 * Which till layout the cashier is using.
 *
 * The switch sits in the top bar and the layout it changes is on the page, and
 * neither is a parent of the other — so the choice lives here rather than being
 * threaded through the layout as props.
 *
 * Kept per device. A cashier who prefers three columns should still have three
 * columns tomorrow morning.
 */

export type PosView = "classic" | "columns";

const KEY = "sp_pos_view";
let current: PosView = "classic";
let loaded = false;
const listeners = new Set<() => void>();

function read(): PosView {
  try {
    return window.localStorage.getItem(KEY) === "columns" ? "columns" : "classic";
  } catch {
    // A browser that refuses storage still gets the default.
    return "classic";
  }
}

function subscribe(listener: () => void): () => void {
  // The stored choice is read on the first subscribe, not while rendering: the
  // server has no localStorage, and reading it during a render would make the
  // two disagree.
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

export function setPosView(next: PosView): void {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // The choice just will not survive a reload.
  }
  listeners.forEach((l) => l());
}

export function usePosView(): PosView {
  return useSyncExternalStore(
    subscribe,
    () => current,
    // The server always renders the default, so the first paint matches.
    () => "classic" as PosView
  );
}
