"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setQueryData, useQuery } from "./useQuery";

/**
 * Rows that grow as you scroll, in place of a pager.
 *
 * Every list in this app is paginated BY THE SERVER — `page` and `limit` go to
 * the API and it slices. That does not change here: this still asks for one
 * page at a time, it just keeps the ones it has already been given and asks
 * for the next when the reader reaches the bottom. Fetching everything up
 * front was the alternative, and the products table alone can hold 50,000
 * rows.
 *
 * The FIRST page goes through `useQuery`, so it lives in the same cache as
 * everything else and a write on another screen still refreshes it. Later
 * pages are held here: they are a property of how far this reader has
 * scrolled, not of the data, and caching them under keys nobody else asks for
 * would only make `invalidate()` lie.
 *
 * Accumulated pages are dropped whenever the KEY changes — a new search term,
 * a different day, another branch — because those rows answered a question
 * nobody is asking any more.
 */
export interface InfiniteRows<T> {
  rows: T[];
  /** What the server says the whole filtered set is worth. */
  total: number;
  /** The first page is still coming; the table has nothing to show yet. */
  loading: boolean;
  /** A later page is on its way. The rows already on screen stay put. */
  loadingMore: boolean;
  /** Any request is in flight, for the thin bar at the top of a table. */
  fetching: boolean;
  error: unknown;
  hasMore: boolean;
  /** Put this on an element after the last row. Reaching it loads the next page. */
  sentinelRef: (node: HTMLElement | null) => void;
  refetch: () => void;
  /**
   * Rewrite the rows in place, for a screen that edits one and wants the change
   * visible before the next refetch.
   *
   * Applied to the cached first page AND to the batches held here, because a
   * row the reader has scrolled to is as much on screen as one they have not.
   * Patching only the cache — which is all `setQueryData` can reach — would
   * leave an edited row unchanged the moment it was past the first batch.
   */
  patch: (fn: (rows: T[]) => T[]) => void;
}

/**
 * The nearest ancestor that actually scrolls, or null for the window.
 *
 * Read from computed style rather than a class name: the tables set their own
 * overflow in several different ways, and a hook that only recognised one of
 * them would silently fall back to the window on the others.
 */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

export function useInfiniteRows<T>(
  key: string,
  fetchPage: (page: number, limit: number) => Promise<{ data: T[]; total: number }>,
  options: {
    /** Rows per request. Not a page size anyone sees — just the batch. */
    pageSize?: number;
    enabled?: boolean;
    staleMs?: number;
    /** How to tell two rows apart when deduping. Defaults to `row.id`. */
    getId?: (row: T) => string;
  } = {}
): InfiniteRows<T> {
  const { pageSize = 25, enabled = true, staleMs, getId } = options;

  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  const first = useQuery(
    key,
    () => fetchRef.current(1, pageSize),
    { enabled, ...(staleMs !== undefined ? { staleMs } : {}) }
  );

  // Pages 2..n, and which page was asked for last.
  const [extra, setExtra] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // A new key is a new question, so anything fetched for the old one goes.
  //
  // Adjusted DURING the render that first sees the new key, not in an effect:
  // React re-runs this component immediately with the cleared state and never
  // paints the old rows under the new heading. An effect would paint them
  // once, then clear — a flash of the previous search's results — and is the
  // cascading-render pattern the lint rule is there to catch.
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setExtra([]);
    setPage(1);
    setLoadingMore(false);
  }

  const firstRows = first.data?.data ?? [];
  const total = first.data?.total ?? 0;

  // Deduped, because page 1 can be refreshed under us — by a write elsewhere,
  // or by coming back to the tab — while later pages are already on screen. A
  // row that moved between pages would otherwise appear twice.
  const id = useCallback(
    (row: T) => (getId ? getId(row) : String((row as { id?: unknown })?.id ?? "")),
    [getId]
  );
  const rows: T[] = [];
  const seen = new Set<string>();
  for (const row of [...firstRows, ...extra]) {
    const rid = id(row);
    if (rid && seen.has(rid)) continue;
    if (rid) seen.add(rid);
    rows.push(row);
  }

  const hasMore = rows.length < total;

  // Guarded by a ref as well as by state: the observer can fire twice before
  // React has re-rendered with `loadingMore` true, and that fetches the same
  // page twice.
  const busy = useRef(false);
  const loadMore = useCallback(async () => {
    if (busy.current || !enabled) return;
    busy.current = true;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const res = await fetchRef.current(next, pageSize);
      setExtra((prev) => [...prev, ...(res?.data ?? [])]);
      setPage(next);
    } catch {
      // The rows already on screen are still good. A failed NEXT page is not
      // worth clearing them for; reaching the bottom again retries.
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [enabled, page, pageSize]);

  // `hasMore` and `loadMore` are read through a ref so the observer is created
  // once per sentinel rather than torn down and rebuilt on every render.
  // Written in an effect, like `fetchRef` above: a ref assigned during render
  // is the pattern that makes a component miss its own updates.
  const state = useRef({ hasMore, loadMore, loading: first.loading });
  useEffect(() => {
    state.current = { hasMore, loadMore, loading: first.loading };
  });

  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver(
      (entries) => {
        const { hasMore: more, loadMore: load, loading } = state.current;
        if (entries[0]?.isIntersecting && more && !loading) void load();
      },
      {
        // The SCROLLER, not the window.
        //
        // These tables are a fixed height with their rows scrolling inside
        // them, so the row after the last one is clipped by that box long
        // before it leaves the window. Watching the window, the sentinel is
        // either never reported as visible — the list simply stops loading —
        // or, on a short list, reported as visible immediately and every page
        // is fetched at once. Watching the box it actually lives in is the
        // only reading that matches what the reader sees.
        root: scrollParent(node),
        // Ahead of the fold, so the next rows are usually there by the time
        // the reader gets to where they go.
        rootMargin: "240px",
      }
    );
    observer.current.observe(node);
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return {
    rows,
    total,
    loading: first.loading,
    loadingMore,
    fetching: first.fetching || loadingMore,
    error: first.error,
    hasMore,
    sentinelRef,
    refetch: useCallback(() => {
      setExtra([]);
      setPage(1);
      void first.refetch();
    }, [first]),
    patch: useCallback(
      (fn: (list: T[]) => T[]) => {
        const cached = first.data;
        if (cached) setQueryData(key, { ...cached, data: fn(cached.data ?? []) });
        setExtra((prev) => fn(prev));
      },
      [first.data, key]
    ),
  };
}
