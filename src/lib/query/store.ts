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
 * Screens whose figures are DERIVED from another screen's data.
 *
 * A sale is written by the till, and it changes the till's own list — and also
 * the dashboard's takings, the CEO overview's charts, the best-seller table and
 * the notification badge. None of those knew, because a write invalidates the
 * prefix it knows about and nothing else, so every one of them sat on a figure
 * from before the sale until somebody reloaded the page by hand. That is the
 * "I have to refresh to see it" this table removes.
 *
 * Kept HERE rather than at each write site on purpose: the alternative is every
 * `invalidate("sales")` call in the codebase listing six more prefixes, and the
 * one somebody forgets is a screen that is quietly wrong. A key is added to this
 * map once, and every existing write starts refreshing it.
 *
 * Only real derivations. Cascading too widely turns one write into a dozen
 * requests, and a till on a slow connection pays for that on every sale.
 */
const DERIVED: Record<string, string[]> = {
  // Takings, order counts, best sellers, the customer's own history — and the
  // shelf, because every sale takes goods off it.
  sales: [
    "dashboard",
    "overview-sales",
    "overview-orders",
    "overview-customers",
    "top-sellers",
    "customers",
    "stock",
    "inventory",
    "pos-products",
  ],
  // A return is a sale moving backwards: the same figures move, and the goods
  // go back on the shelf.
  returns: [
    "dashboard",
    "overview-sales",
    "overview-orders",
    "top-sellers",
    "sales",
    "stock",
    "inventory",
    "pos-products",
    "customers",
  ],
  // Stock value and the low-stock counts.
  stock: ["dashboard", "inventory", "pos-products"],
  inventory: ["dashboard", "pos-products"],
  // Both ends of a transfer are stock.
  transfers: ["stock", "inventory", "pos-products"],
  // What is owed, and what it was spent on.
  purchases: ["dashboard", "suppliers"],
  customers: ["overview-customers"],
  // The unread badge is a different key from the list, and prefix matching
  // does not reach it: "notifications-unread" does not start with
  // "notifications:".
  notifications: ["notifications-unread"],
  // A price or a product edit reaches the till's wall and its lookup.
  products: ["inventory", "pos-products"],
  // Money in or out that is not a sale. The Income & Expense screen, the
  // voucher screen and a regular payment falling due all write the SAME two
  // tables, so all three move the same figures — the other screen's list, its
  // cards, and the dashboard's P&L.
  //
  // Listed out rather than chained: `withDerived` is one pass, not a walk, so
  // a derived key's own derivations are not followed.
  // `report-pnl` is on every one of these because a voucher IS an income or an
  // expense row, and `ProfitService.calculate` reads both. Writing one — or
  // VOIDING one, which reverses its ledger rows and removes it — moved the
  // Reports P&L and left the open report showing the figure from before.
  vouchers: [
    "vouchers-summary",
    "finance-summary",
    "finance-transactions",
    "report-pnl",
    "dashboard",
  ],
  "regular-payments": [
    "regular-summary",
    "vouchers",
    "vouchers-summary",
    "finance-summary",
    "finance-transactions",
    "report-pnl",
    "dashboard",
  ],
  // And the same in the other direction: an expense typed into the Income &
  // Expense screen is a voucher without a number, and it moves the P&L card on
  // the dashboard exactly as one written here does.
  "finance-summary": [
    "finance-transactions",
    "vouchers",
    "vouchers-summary",
    "report-pnl",
    "dashboard",
  ],
  "finance-transactions": [
    "finance-summary",
    "vouchers",
    "vouchers-summary",
    "report-pnl",
    "dashboard",
  ],
};

/** The prefixes to clear for a write, the named ones plus what they feed. */
/**
 * Caches that live OUTSIDE this store and must be dropped with it.
 *
 * A service is free to memoise something of its own —
 * `SettingsService.getValues` holds one resolved map per branch, so ten
 * components asking at once make one request. The catch is that this store's
 * entries going stale only makes them REFETCH, and a refetch calls straight
 * back into that memo and is handed the same stale answer.
 *
 * It bit hardest across tabs. A shop keeps the back office open beside the
 * till; saving a setting in one tab broadcasts an invalidation to the other,
 * whose queries dutifully refetch — and whose service memo was never cleared,
 * because the write happened in a different JavaScript world. The till went on
 * using yesterday's VAT rate, discount ceiling and POS switches until somebody
 * reloaded the page by hand, and nothing on screen suggested why.
 *
 * Hooks run for BOTH paths, local and broadcast, because both go through
 * `invalidateLocal`.
 */
type InvalidationHook = (prefixes: string[]) => void;
const invalidationHooks = new Set<InvalidationHook>();

/**
 * Run `fn` whenever anything under these prefixes is invalidated, in this tab.
 *
 * Registered at module scope by the service that owns the outside cache, so it
 * is wired as soon as that service is imported. Returns an unsubscribe for
 * tests.
 */
export function onInvalidate(fn: InvalidationHook): () => void {
  invalidationHooks.add(fn);
  return () => invalidationHooks.delete(fn);
}

function withDerived(prefixes: string[]): string[] {
  const out = new Set(prefixes);
  for (const prefix of prefixes) {
    for (const derived of DERIVED[prefix] ?? []) out.add(derived);
  }
  return Array.from(out);
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
  invalidateLocal(prefixes);
  broadcast(prefixes);
}

/**
 * The same invalidation, from another tab.
 *
 * A shop keeps the back office open beside the till. Each tab has its own cache
 * — they are separate JavaScript worlds — so a price edited in one left the
 * other showing the old figure until somebody reloaded it by hand. This is the
 * bridge, and it is why `invalidate` and `invalidateLocal` are two functions:
 * an arriving message must NOT be re-broadcast, or two tabs bounce the same
 * invalidation off each other forever.
 */
function invalidateLocal(prefixes: string[]): void {
  const all = withDerived(prefixes);
  const hit = (key: string) => all.some((p) => key === p || key.startsWith(`${p}:`));

  // Before the refetches, not after: a hook that clears a service memo has to
  // have run by the time a woken subscriber calls back into it.
  for (const hook of invalidationHooks) {
    try {
      hook(all);
    } catch {
      // A misbehaving hook must not stop the invalidation it was told about.
    }
  }

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

/**
 * Tell the other tabs of this origin.
 *
 * BroadcastChannel is same-origin by construction, so a message can only reach
 * this shop's own tabs — and each tenant is its own subdomain, so one company's
 * writes cannot wake another's screens even on a shared machine.
 *
 * Everything is wrapped: a browser without BroadcastChannel (or one refusing it
 * in a private window) must lose the cross-tab refresh, not the write.
 */
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (channel) return channel;
  try {
    channel = new BroadcastChannel("sp-cache");
    channel.onmessage = (event: MessageEvent) => {
      const prefixes = event.data?.prefixes;
      if (Array.isArray(prefixes)) invalidateLocal(prefixes);
    };
  } catch {
    channel = null;
  }
  return channel;
}

function broadcast(prefixes: string[]): void {
  try {
    getChannel()?.postMessage({ prefixes });
  } catch {
    // The tab that made the write is already correct; the others will catch up
    // when they are next focused.
  }
}

// Opened eagerly so a tab that only READS still hears about other tabs' writes.
// A listener attached on the first local invalidation would never exist on a
// screen that never writes — which is exactly the screen left showing stale
// figures.
getChannel();

/** Forget everything. Used on sign-out so the next account sees no trace. */
export function clearCache(): void {
  const keys = Array.from(entries.keys());
  entries.clear();
  // Every hook, whatever it watches: this is sign-out, and leaving one
  // account's resolved settings memoised for the next one is the same leak
  // this function exists to prevent.
  for (const hook of invalidationHooks) {
    try {
      hook(ALL_PREFIXES);
    } catch {
      // As above.
    }
  }
  keys.forEach(emit);
}

/** What a hook is handed when EVERYTHING is being dropped. */
export const ALL_PREFIXES: string[] = ["*"];

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
