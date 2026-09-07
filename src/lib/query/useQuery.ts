"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_STALE_MS,
  fetchQuery,
  getEntry,
  invalidate,
  queryKey,
  setQueryData,
  subscribe,
} from "./store";

export { invalidate, queryKey, setQueryData };

export type QueryState<T> = {
  data: T | undefined;
  /** True only when there is nothing to show yet. A refresh over cached rows is not "loading". */
  loading: boolean;
  /** True while a request is in flight, cached rows or not. Drive a thin top bar off this. */
  fetching: boolean;
  error: unknown;
  refetch: () => Promise<T | undefined>;
};

export type QueryOptions = {
  /** How long an answer counts as fresh. Within it, a mount asks nothing. */
  staleMs?: number;
  /** Skip the request entirely — for a key that depends on something not ready yet. */
  enabled?: boolean;
  /** Refetch when the tab regains focus. On by default; a till left open overnight should not lie. */
  refetchOnFocus?: boolean;
};

/**
 * Read a server value through the shared cache.
 *
 * The contract that matters for how screens feel:
 *
 * - First visit to a key: `loading` is true, `data` undefined. Show a skeleton.
 * - Every later visit inside the stale window: `loading` is FALSE and `data`
 *   is the previous answer, on the first render. No skeleton, no flash.
 * - Outside the window: `data` is still the previous answer and `fetching` is
 *   true. The screen stays usable while the refresh lands underneath it.
 * - After a write calls `invalidate()`: subscribers refetch immediately, so a
 *   row added on one screen shows up on every screen reading that key.
 *
 * `key` must be a string, not an array — it is the cache identity, and
 * `queryKey("customers", { page, search })` builds a stable one.
 *
 * `fetcher` is read from a ref, so an inline arrow function is fine and does
 * not restart the request on every render. Only `key` does that.
 */
export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: QueryOptions = {}
): QueryState<T> {
  const { staleMs = DEFAULT_STALE_MS, enabled = true, refetchOnFocus = true } = options;

  // Kept in a ref so an inline arrow fetcher does not restart the request on
  // every render; only `key` does that. Written in an effect rather than
  // during render, and declared BEFORE the effect that fetches so it is
  // already current by the time that one runs.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Subscribing to the store rather than mirroring it into state is what lets
  // a write on another screen update this one: both read the same entry.
  const entry = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    useCallback(() => getEntry<T>(key), [key]),
    useCallback(() => getEntry<T>(key), [key])
  );

  const run = useCallback(
    (force: boolean) => {
      if (!enabled) return Promise.resolve(undefined);
      return fetchQuery<T>(key, () => fetcherRef.current(), { staleMs, force }).catch(
        // The error is already on the entry; swallowing the rejection here
        // stops it surfacing as an unhandled promise in the console.
        () => undefined
      );
    },
    [key, enabled, staleMs]
  );

  // `updatedAt` is the refetch trigger: `invalidate()` resets it to 0, which
  // changes this dependency and sends the request back out. It is also how a
  // write on another screen reaches this one.
  useEffect(() => {
    void run(false);
  }, [run, entry.updatedAt]);

  useEffect(() => {
    if (!refetchOnFocus || !enabled) return;
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      /**
       * FORCED, not "if stale".
       *
       * Coming back to a tab is the strongest signal there is that something
       * happened elsewhere — a price edited in the back office, a delivery
       * counted in, another till selling the last one. Honouring the 30-second
       * freshness window here meant a quick switch away and back showed the old
       * figures, which is precisely the "I had to reload the page" case.
       *
       * The two-second floor is the only guard: a rapid alt-tab must not fire a
       * request per query per flick.
       */
      const age = Date.now() - getEntry(key).updatedAt;
      void run(age > 2_000);
    };
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [run, refetchOnFocus, enabled, key]);

  return {
    data: entry.data,
    loading: enabled && entry.data === undefined && entry.error === undefined,
    fetching: entry.promise !== undefined,
    error: entry.error,
    refetch: useCallback(() => run(true) as Promise<T | undefined>, [run]),
  };
}

/**
 * A write, with the invalidation that keeps every screen honest afterwards.
 *
 * `useMutation(fn, { invalidates: ["customers"] })` — on success the cache
 * entries under those prefixes are marked stale and every mounted `useQuery`
 * on them refetches at once. That is the whole "updates instantly when new
 * data is added" behaviour; it is not a refresh button and not a poll.
 */
export function useMutation<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  options: { invalidates?: string[] } = {}
): {
  mutate: (...args: Args) => Promise<R>;
  pending: boolean;
  error: unknown;
  reset: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const invalidates = options.invalidates ?? [];
  // Read from refs so the caller can pass a literal array and an inline
  // function without `mutate`'s identity changing on every render.
  const keysRef = useRef(invalidates);
  const fnRef = useRef(fn);
  useEffect(() => {
    keysRef.current = invalidates;
    fnRef.current = fn;
  });

  const mutate = useCallback(async (...args: Args) => {
    setPending(true);
    setError(undefined);
    try {
      const result = await fnRef.current(...args);
      if (keysRef.current.length) invalidate(...keysRef.current);
      return result;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setPending(false);
    }
  }, []);

  return { mutate, pending, error, reset: useCallback(() => setError(undefined), []) };
}
