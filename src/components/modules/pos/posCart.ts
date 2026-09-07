"use client";

import { useSyncExternalStore } from "react";
import { tokenStore } from "@/services/apiClient";
import { CartItem, Customer } from "@/types/pos";

/**
 * The sale being rung up right now.
 *
 * It lived in `useState` on the till page, which meant the route owned it: a
 * cashier who stepped over to Products to check a shelf price came back to an
 * empty invoice, and so did anyone whose browser reloaded the tab. A half-rung
 * sale is the one thing at a till that must not be thrown away by accident.
 *
 * So it lives here instead — outside the page, and mirrored into localStorage
 * — for the same reason the layout choice does: the thing that owns it is the
 * till, not whichever screen the cashier is looking at.
 *
 * Kept per branch, like the product offers: a cart started in Dhaka is not
 * waiting on the Chattogram till. And kept for one shift only, so yesterday's
 * abandoned cart does not greet the morning cashier as if it were live.
 */

const KEY = "sp_pos_draft";

/** A shift. Older than this and the cart is abandoned, not in progress. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface PosDraft {
  items: CartItem[];
  /** Whom the invoice is for, once the cashier has picked somebody. */
  customer: Customer | null;
  /** What the cashier typed into the discount box, verbatim. */
  discount: string;
  discountMode: "percent" | "flat";
  /** The VAT override: `null` is "the shop's own rate". See CartPanel. */
  vat: string | null;
}

export const EMPTY_DRAFT: PosDraft = {
  items: [],
  customer: null,
  discount: "",
  discountMode: "percent",
  vat: null,
};

let current: PosDraft = EMPTY_DRAFT;
let loaded = false;
const listeners = new Set<() => void>();

/** One draft per branch, so switching branch does not carry a cart across. */
function storeKey(): string {
  return `${KEY}_${tokenStore.branch() || "all"}`;
}

/** Nothing worth saving — an untouched till. */
function isEmpty(d: PosDraft): boolean {
  return (
    d.items.length === 0 &&
    d.customer === null &&
    d.discount === "" &&
    d.vat === null
  );
}

/**
 * The saved cart, or none.
 *
 * Every line is checked before it is trusted: this is a string from the disk
 * of a machine anyone can open the console on, and a malformed line would
 * crash the till on the render that read it rather than at the write.
 */
function read(): PosDraft {
  try {
    const raw = window.localStorage.getItem(storeKey());
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<PosDraft> & { at?: number };
    if (
      !Number.isFinite(parsed.at) ||
      Date.now() - Number(parsed.at) > MAX_AGE_MS
    ) {
      return EMPTY_DRAFT;
    }
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter(
          (i): i is CartItem =>
            !!i &&
            typeof i === "object" &&
            !!(i as CartItem).product &&
            typeof (i as CartItem).product.id === "string" &&
            Number.isFinite((i as CartItem).quantity) &&
            (i as CartItem).quantity > 0,
        )
      : [];
    const next: PosDraft = {
      items,
      customer:
        parsed.customer && typeof parsed.customer.id === "string"
          ? parsed.customer
          : null,
      discount: typeof parsed.discount === "string" ? parsed.discount : "",
      discountMode: parsed.discountMode === "flat" ? "flat" : "percent",
      vat: typeof parsed.vat === "string" ? parsed.vat : null,
    };
    return isEmpty(next) ? EMPTY_DRAFT : next;
  } catch {
    // A browser that refuses storage, or a half-written entry, starts fresh.
    return EMPTY_DRAFT;
  }
}

function write(next: PosDraft): void {
  try {
    if (isEmpty(next)) window.localStorage.removeItem(storeKey());
    else
      window.localStorage.setItem(
        storeKey(),
        JSON.stringify({ ...next, at: Date.now() }),
      );
  } catch {
    // The cart still survives navigation for this session; only a reload
    // loses it.
  }
}

function subscribe(listener: () => void): () => void {
  // The saved cart is read on the first subscribe, not while rendering: the
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

/** Change part of the draft. Patches, so each screen touches only its own. */
export function patchPosDraft(patch: Partial<PosDraft>): void {
  const next = { ...current, ...patch };
  if (
    next.items === current.items &&
    next.customer === current.customer &&
    next.discount === current.discount &&
    next.discountMode === current.discountMode &&
    next.vat === current.vat
  ) {
    return;
  }
  current = next;
  write(current);
  listeners.forEach((l) => l());
}

/** The cart lines, updated the way `setState` updates them. */
export function setDraftItems(update: (prev: CartItem[]) => CartItem[]): void {
  patchPosDraft({ items: update(current.items) });
}

/** A finished or abandoned sale: nothing of it is left behind. */
export function clearPosDraft(): void {
  patchPosDraft(EMPTY_DRAFT);
}

export function usePosDraft(): PosDraft {
  return useSyncExternalStore(
    subscribe,
    () => current,
    // The server always renders an empty till, so the first paint matches.
    () => EMPTY_DRAFT,
  );
}
