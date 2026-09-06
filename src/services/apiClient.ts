/**
 * Talks to the API so no screen has to.
 *
 * It unwraps the `{success, data}` envelope, turns money strings into
 * numbers, and sends every path exactly as written.
 */

import { clearCache } from "@/lib/query/store";

/** An error the API sent back. `code` says which one. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: Record<string, unknown>;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    errors: Record<string, unknown> = {},
    requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.requestId = requestId;
  }
}

/**
 * Where the API lives. Taken from the page address: one build serves every
 * company, and a token only works on its own address.
 * `NEXT_PUBLIC_API_URL` points it somewhere else.
 */
export function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, "");

  if (typeof window === "undefined") return "";

  const port = process.env.NEXT_PUBLIC_API_PORT || "8000";
  const { protocol, hostname } = window.location;
  const host = port ? `${hostname}:${port}` : hostname;
  return `${protocol}//${host}/api/v1`;
}

/**
 * Platform login or company login? Same rule the server uses: the base
 * domain is the platform, anything.<base domain> is that company.
 * It decides which login endpoint the page calls.
 */
export function resolveRealm(): "tenant" | "platform" {
  if (typeof window === "undefined") return "platform";

  const base = (process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN || "").trim().toLowerCase();
  if (!base) return "platform";

  const host = window.location.hostname.toLowerCase();
  const platformHosts = (process.env.NEXT_PUBLIC_PLATFORM_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (host === base || platformHosts.includes(host)) return "platform";
  if (host.endsWith(`.${base}`) && host.slice(0, -(base.length + 1)).length > 0) return "tenant";
  return "platform";
}

/** The company name in the address, if there is one. */
export function currentSubdomain(): string | null {
  if (resolveRealm() !== "tenant" || typeof window === "undefined") return null;
  const base = (process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN || "").trim().toLowerCase();
  const host = window.location.hostname.toLowerCase();
  return host.slice(0, -(base.length + 1)) || null;
}

/** True when there is an API to call. */
export function apiConfigured(): boolean {
  return Boolean(resolveBaseUrl());
}

export function snakeToCamelCase<T = any>(obj: any): T {
  if (Array.isArray(obj)) {
    return obj.map((v) => snakeToCamelCase(v)) as unknown as T;
  }
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
      result[camelKey] = snakeToCamelCase(obj[key]);
      return result;
    }, {} as Record<string, any>) as T;
  }
  return obj;
}

/**
 * Money string -> number. Only use it on money: invoice numbers and barcodes
 * are digits too, and neither is an amount.
 */
export function toAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const TOKEN_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const BRANCH_KEY = "active_branch";

/**
 * Small markers the route guard can read; it runs before the page and cannot
 * see localStorage. They hold no token, so faking one shows an empty page.
 */
const SESSION_COOKIE = "sp_session";

/** How much of the app this person sees: "pos" or "full". */
const SCOPE_COOKIE = "sp_scope";

function writeCookie(name: string, value: string | null) {
  if (typeof document === "undefined") return;
  document.cookie =
    value === null
      ? `${name}=; path=/; SameSite=Lax; max-age=0`
      : `${name}=${value}; path=/; SameSite=Lax; max-age=${60 * 60 * 24 * 7}`;
}

export const tokenStore = {
  access: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  refresh: () => (typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY)),
  branch: () => (typeof window === "undefined" ? null : localStorage.getItem(BRANCH_KEY)),
  set(access: string, refresh?: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, access);
    // Older code reads "token". Write both, so a half-updated build cannot
    // log somebody out.
    localStorage.setItem("token", access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    writeCookie(SESSION_COOKIE, "1");
  },
  setScope(scope: "pos" | "full") {
    writeCookie(SCOPE_COOKIE, scope);
  },
  setBranch(branchId: string | null) {
    if (typeof window === "undefined") return;
    if (branchId) localStorage.setItem(BRANCH_KEY, branchId);
    else localStorage.removeItem(BRANCH_KEY);
  },
  clear() {
    if (typeof window === "undefined") return;
    [TOKEN_KEY, REFRESH_KEY, BRANCH_KEY, "token"].forEach((k) => localStorage.removeItem(k));
    writeCookie(SESSION_COOKIE, null);
    writeCookie(SCOPE_COOKIE, null);
  },
};

/**
 * Use the path exactly as written. Never add a trailing slash.
 *
 * The API mixes both on purpose: `/auth/login` has none, `/products/` does.
 * Adding one turns every sign-in into a 404.
 */
function normalizeEndpoint(endpoint: string): string {
  return endpoint;
}

export interface ApiFetchOptions extends RequestInit {
  mapSnakeCase?: boolean;
  /** Sent as `Idempotency-Key`. POST /sales and partner payments need it. */
  idempotencyKey?: string;
  /** Use one branch for this request only, without switching the user to it. */
  branchId?: string;
  /** Skip the Authorization header (login, refresh, accept-invitation). */
  anonymous?: boolean;
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  errors?: Record<string, unknown>;
  requestId?: string;
  meta?: { page?: number; limit?: number; total?: number; totalPages?: number };
}

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * The session is over: clear it and go to the sign-in page.
 *
 * The route guard in `proxy.ts` already sends a signed-out visitor to
 * `/login?next=...`, but it only runs on a NAVIGATION. A token that expires
 * while somebody is sitting on a page produces 401s and nothing else — the
 * screen fills with "Your session has ended" and stays there, still showing
 * the last data it loaded. So the one place that knows the session is
 * finished navigates, and the guard's own contract is reused rather than
 * duplicated: same URL, same `next`, so signing in returns them to the page
 * they were on.
 *
 * `location.replace`, not `assign`: the dead page should not be a back-button
 * away. `redirecting` guards the case where ten in-flight requests all fail at
 * once — one navigation, not ten.
 */
let redirecting = false;

function endSession() {
  tokenStore.clear();
  // Cached rows outlive the token otherwise, and the next account to sign in
  // on this device would paint the previous one's data for a moment before
  // its own request landed.
  clearCache();
  if (typeof window === "undefined" || redirecting) return;

  const { pathname, search } = window.location;
  // Already there, or on the way. Redirecting from /login would loop.
  if (pathname === "/login" || pathname.startsWith("/login/")) return;

  redirecting = true;
  const next = `${pathname}${search}`;
  window.location.replace(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
}

/**
 * Codes that mean "this token is finished", as opposed to "this request was
 * refused". A 401 on an authenticated request is the first kind by default:
 * the endpoint let us try, and the credential is what failed.
 *
 * TENANT_MISMATCH is a 403 and belongs here anyway — the token is valid but
 * for a different company's address, and no retry from this page can fix it.
 */
const DEAD_SESSION_CODES = new Set(["TENANT_MISMATCH", "REALM_MISMATCH"]);

async function request<T>(
  endpoint: string,
  options: ApiFetchOptions,
  allowRefresh: boolean
): Promise<Envelope<T>> {
  const { mapSnakeCase = true, idempotencyKey, branchId, anonymous, ...fetchOptions } = options;
  const base = resolveBaseUrl();
  const url = `${base}/${normalizeEndpoint(endpoint).replace(/^\/+/, "")}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  if (!anonymous && !headers["Authorization"]) {
    const token = tokenStore.access();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  // Only when the caller asks for another branch. `x-branch` IS in the API's
  // CORS_ALLOW_HEADERS — the note that used to sit here said otherwise and was
  // wrong — but sending it on every request would pin every call to one branch
  // and take the server's own active-branch cursor out of the picture.
  if (branchId) headers["X-Branch"] = branchId;

  let response: Response;
  try {
    response = await fetch(url, { ...fetchOptions, headers });
  } catch (cause) {
    // No answer at all: offline, DNS, refused, CORS. Its own code, so callers
    // can tell "the server said no" from "there was no server".
    throw new ApiError(0, "NETWORK_ERROR", `Could not reach the API at ${base}.`, {
      cause: String(cause),
    });
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (mapSnakeCase && body) body = snakeToCamelCase(body);

  if (response.ok) return body as Envelope<T>;

  // An expired token is the one failure worth one retry.
  if (response.status === 401 && allowRefresh && !anonymous && body?.code === "TOKEN_EXPIRED") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(endpoint, options, false);
  }

  // Nothing left to try with. An anonymous call is exempt on purpose: a wrong
  // password on the sign-in form is a 401 too, and bouncing the person off the
  // page they are typing into would be absurd.
  if (!anonymous && (response.status === 401 || DEAD_SESSION_CODES.has(body?.code))) {
    endSession();
  }

  throw new ApiError(
    response.status,
    body?.code || "HTTP_ERROR",
    body?.message || `Request to ${endpoint} failed with ${response.status}.`,
    body?.errors || {},
    body?.requestId
  );
}

let refreshInFlight: Promise<boolean> | null = null;

/** Refresh the token. Shared, so ten 401s cause one refresh instead of ten. */
async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const refresh = tokenStore.refresh();
  if (!refresh) return false;

  refreshInFlight = (async () => {
    try {
      const body = await request<{ access: string; refresh?: string }>(
        "/auth/refresh",
        { method: "POST", body: JSON.stringify({ refresh }), anonymous: true },
        false
      );
      const access = body?.data?.access;
      if (!access) return false;
      tokenStore.set(access, body?.data?.refresh);
      return true;
    } catch {
      // The server killed the whole token family — a reused refresh token does
      // exactly this — so there is nothing left to retry with. End the session
      // rather than looping, and say so by going to the sign-in page.
      endSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * One request, envelope removed.
 *
 * There is no fallback argument any more, by design. It used to accept sample
 * data to serve when the server could not be reached, and the guard around it
 * was correct — dev only, network errors only — but three call sites had
 * grown their own way around the guard, and a till showing made-up prices in
 * a real shop is worse than one that says it is offline. A failure now
 * reaches the screen, which is the only place that can honestly report it.
 */
export async function apiFetch<T>(
  endpoint: string,
  options?: ApiFetchOptions,
  mapper?: (data: any) => T
): Promise<T> {
  if (!apiConfigured()) throw new ApiError(0, "NO_API_CONFIGURED", "No API is configured.");

  const body = await request<T>(endpoint, options || {}, true);
  const payload = (body && "data" in body ? body.data : body) as T;
  return mapper ? mapper(payload) : payload;
}

export async function apiList<T>(
  endpoint: string,
  options?: ApiFetchOptions,
  mapItem?: (row: any) => T
): Promise<PagedResult<T>> {
  if (!apiConfigured()) throw new ApiError(0, "NO_API_CONFIGURED", "No API is configured.");

  const body = await request<T[]>(endpoint, options || {}, true);
  const rows = Array.isArray(body?.data) ? body.data : [];
  const meta = body?.meta || {};

  return {
    data: mapItem ? rows.map(mapItem) : (rows as T[]),
    total: meta.total ?? rows.length,
    page: meta.page ?? 1,
    limit: meta.limit ?? rows.length,
    totalPages: meta.totalPages ?? 1,
  };
}


/**
 * Every page of a list, up to a limit.
 *
 * The API returns 200 rows at most, so one call cannot cover a table that
 * joins a whole collection: ask for 500 stock rows and the SKUs you do not
 * get quietly read as zero stock.
 */
export async function apiListAll<T>(
  endpoint: string,
  mapItem?: (row: any) => T,
  maxPages = 6
): Promise<T[]> {
  const joiner = endpoint.includes("?") ? "&" : "?";
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await apiList<T>(
      `${endpoint}${joiner}limit=200&page=${page}`,
      { method: "GET" },
      mapItem
    );
    out.push(...res.data);
    if (out.length >= res.total || res.data.length === 0) break;
  }
  return out;
}
