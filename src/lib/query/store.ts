/**
 * A small stale-while-revalidate cache.
 *
 * The app has no data-fetching library. Every screen ran its own
 * `useEffect` + `useState(loading)` pair, so moving from Customers to Sales
 * and back re-fetched a list the browser had held two seconds earlier and
 * showed a blank table while it did. That is the flicker this removes.
 *
 * Three jobs, and only three:
 *
 * 1. Hold the last answer for a key, so a revisit paints instantly.
 * 2. Collapse concurrent asks for the same key into ONE request, so a page
 *    with four components reading the same list does not open four sockets.
 * 3. Tell every subscriber when an entry changes, so a write on one screen
 *    updates a list rendered on another without either knowing about the other.
 *
 * What it deliberately does NOT do: persist across a reload (a POS terminal
 * showing yesterday's stock because it was in localStorage is worse than a
 * spinner), or retry (`apiClient` already distinguishes a network failure
 * from a 4xx, and a retry on a 403 is just noise).
 */

export type CacheEntry<T> = {
  data: T | undefined;
  error: unknown;
  /** When `data` was last written. 0 means never. */
  updatedAt: number;
  /** In-flight request, shared by every caller that asks while it runs. */
  promise: Promise<T> | undefined;
};

type Listener = () => void;

const entries = new Map<string, CacheEntry<unknown>>();
const listeners = new Map<string, Set<Listener>>();

/** Default freshness. Within this window a mount serves cache and asks nothing. */
export const DEFAULT_STALE_MS = 30_000;

/**
 * The answer for a key nothing has written yet.
 *
 * ONE frozen object, shared by every miss, because `getEntry` is a
 * `useSyncExternalStore` snapshot: returning a freshly built object for an
 * absent key makes React compare two different references on every render,
 * decide the store changed, and re-render forever. React reports that as "The
 * result of getServerSnapshot should be cached to avoid an infinite loop".
 *
 * Present keys are already stable — an entry object is only replaced by
 * `write`, which is what a real change is.
 */
const EMPTY: CacheEntry<unknown> = Object.freeze({
  data: undefined,
  error: undefined,
  updatedAt: 0,
  promise: undefined,
});

export function getEntry<T>(key: string): CacheEntry<T> {
  return (entries.get(key) as CacheEntry<T> | undefined) ?? (EMPTY as CacheEntry<T>);
}

function write<T>(key: string, patch: Partial<CacheEntry<T>>): void {
  const next = { ...getEntry<T>(key), ...patch };
  entries.set(key, next as CacheEntry<unknown>);
  emit(key);
}

export function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(key);
  };
}

function emit(key: string): void {
  listeners.get(key)?.forEach((l) => l());
}

/**
 * Fetch through the cache.
 *
 * `force` skips the freshness check but still joins an in-flight request —
 * two components refreshing at once is one refresh, not two.
 */
export function fetchQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  { staleMs = DEFAULT_STALE_MS, force = false }: { staleMs?: number; force?: boolean } = {}
): Promise<T> {
  const entry = getEntry<T>(key);

  if (entry.promise) return entry.promise;

  const fresh = entry.updatedAt > 0 && Date.now() - entry.updatedAt < staleMs;
  if (fresh && !force && entry.error === undefined) {
    return Promise.resolve(entry.data as T);
  }

  const promise = fetcher()
    .then((data) => {
      write<T>(key, { data, error: undefined, updatedAt: Date.now(), promise: undefined });
      return data;
    })
    .catch((error) => {
      // The stale data stays. A list that briefly fails to refresh should keep
      // showing the rows it has, with the error surfaced beside them, rather
      // than emptying the table under someone mid-task.
      write<T>(key, { error, promise: undefined });
      throw error;
    });

  write<T>(key, { promise });
  return promise;
}

/**
 * Drop cached answers so the next read goes to the server, and wake anything
 * already on screen so it refetches now.
 *
 * Matching is by prefix, which is why keys are written most-general-first:
 * invalidating `"customers"` also clears `"customers:page=2"`. Call it after a
 * write. `CustomerService.createCustomer` invalidating `"customers"` is what
 * makes a new customer appear in the table the moment the modal closes.
 */
export function invalidate(...prefixes: string[]): void {
  const hit = (key: string) => prefixes.some((p) => key === p || key.startsWith(`${p}:`));

  for (const key of Array.from(entries.keys())) {
    if (!hit(key)) continue;
    // updatedAt 0 marks it stale without discarding `data`: subscribers keep
    // painting the rows they have while the refetch is in flight.
    write(key, { updatedAt: 0 });
  }
  for (const key of Array.from(listeners.keys())) {
    if (hit(key)) emit(key);
  }
}

/** Forget everything. Used on sign-out so the next account sees no trace. */
export function clearCache(): void {
  const keys = Array.from(entries.keys());
  entries.clear();
  keys.forEach(emit);
}

/** Write a value straight into the cache, e.g. after a mutation returns the row. */
export function setQueryData<T>(key: string, data: T): void {
  write<T>(key, { data, error: undefined, updatedAt: Date.now() });
}

/** Build a stable key from parts. `undefined`/`null`/`""` parts are dropped. */
export function queryKey(base: string, params?: Record<string, unknown>): string {
  if (!params) return base;
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.length ? `${base}:${parts.join("&")}` : base;
}
