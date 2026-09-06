"use client";

import { useSyncExternalStore } from "react";
import { DiscountMap, discountStoreKey, readDiscounts } from "./posDiscounts";

/** The event the writer fires, because `storage` never reaches its own tab. */
export const DISCOUNTS_CHANGED = "sp:discounts-changed";

const EMPTY: DiscountMap = {};

// The parsed map, cached against the raw string it came from. `getSnapshot`
// must return the SAME object until something actually changes — parsing on
// every call hands React a new reference each render and it re-renders
// forever.
let cachedKey = "";
let cachedRaw: string | null = null;
let cached: DiscountMap = EMPTY;

function getSnapshot(): DiscountMap {
  try {
    const key = discountStoreKey();
    const raw = window.localStorage.getItem(key);
    if (key !== cachedKey || raw !== cachedRaw) {
      cachedKey = key;
      cachedRaw = raw;
      cached = readDiscounts();
    }
    return cached;
  } catch {
    // A browser that refuses storage simply has no offers.
    return EMPTY;
  }
}

/** The server has no localStorage, so it renders the no-offers case. */
function getServerSnapshot(): DiscountMap {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  // `storage` covers the second till on the shop floor and a second tab on this
  // machine; the custom event covers the tab that did the writing, which the
  // platform deliberately does not notify.
  window.addEventListener("storage", onChange);
  window.addEventListener(DISCOUNTS_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISCOUNTS_CHANGED, onChange);
  };
}

/**
 * The branch's product offers, kept in step with the screen that sets them.
 *
 * `useSyncExternalStore` rather than an effect: localStorage is exactly the
 * "external system" it exists for, and it gets the server pass right by
 * construction instead of by painting the wrong thing and correcting it.
 */
export function useProductDiscounts(): DiscountMap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
