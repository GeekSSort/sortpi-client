import { apiFetch, tokenStore, ApiError, resolveRealm } from "./apiClient";
import { POS_HOME, firstBackOfficePage } from "@/lib/pageAccess";
import { clearAllPosDrafts } from "@/components/modules/pos/posCart";

export interface UserSession {
  id: string;
  /** Permission codes the server worked out for this branch. */
  permissions: string[];
  /** Where this person lands, and stays. */
  /**
   * Where to send this account after sign-in.
   *
   * A path, not a two-value union. It was `"/pos" | "/dashboard"`, and that
   * type was the shape of the defect: a role with a back office but no
   * `dashboard.view` has no correct value in it, so every such role was typed
   * into the till. See `homeFor`.
   */
  home: string;
  /** Full name where there is room for one. */
  name: string;
  /** First name only, for "Welcome, ___". Never an email address. */
  greeting: string;
  email: string;
  avatar: string;
  role: string;
  /**
   * The branch the server has this person standing in, or null for the whole
   * company. Screens that show branch-scoped lists say which branch they are
   * showing — a narrowed list with no label reads as missing data.
   */
  activeBranch: { id: string; code: string; name: string } | null;
  /**
   * What the company pays for, and what it is using.
   *
   * `/auth/me` has carried this since plan limits were built and nothing read
   * it, so the only way to learn you were at your branch ceiling was to fill in
   * the form and be refused. `null` means the organization has no
   * subscription — an unmetered tenant that predates billing — which is a
   * distinct state from "at the limit" and must not be shown as one.
   */
  subscription: SubscriptionSummary | null;
  token?: string;
}

/** The plan an organization is on, with both halves of the limit picture. */
export interface SubscriptionSummary {
  plan: string;
  planName: string;
  status: string;
  /** Per resource. `null` is no ceiling. */
  limits: Record<string, number | null>;
  usage: Record<string, number>;
}

/**
 * The API's `{max_branches: 3}` after the client has camelCased every key.
 *
 * `apiClient.snakeToCamelCase` walks the WHOLE response, and it cannot tell a
 * field name from a map key — so `subscription.limits.max_branches` arrives as
 * `limits.maxBranches`. Everything that read the snake_case name got
 * `undefined`, which is why the Upgrade dialog showed "0 / Unlimited" against
 * a plan with real ceilings and then greyed out every plan above it: an
 * unknown current ceiling compared as if it were unlimited.
 *
 * Normalised HERE, once, at the boundary where the response becomes a session
 * — rather than teaching four call sites to try both spellings. The rest of
 * the app keeps the server's own names, which is what its permission codes,
 * error payloads and `LimitService` counters all use.
 */
function toLimitMap<T>(raw: Record<string, T> | undefined | null): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    // maxBranches -> max_branches. Already-snake keys pass through unchanged,
    // so this is safe whichever spelling arrives.
    out[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = value;
  }
  return out;
}

/**
 * Whether one more of `name` would exceed the plan.
 *
 * The same question `LimitService.assert_within` answers on the server, asked
 * BEFORE the form opens rather than after it is submitted. The server is still
 * the authority — this only decides whether to offer the button.
 */
export function atPlanLimit(
  subscription: SubscriptionSummary | null | undefined,
  name: "max_branches" | "max_users" | "max_products"
): boolean {
  if (!subscription) return false; // unmetered
  const ceiling = subscription.limits?.[name];
  // `null` is "no ceiling". `undefined` is "we do not know" — a limit the
  // server did not state — and neither is a reason to block the button.
  if (ceiling === null || ceiling === undefined) return false;
  return (subscription.usage?.[name] ?? 0) >= ceiling;
}

export interface LoginPayload {
  email: string;
  pin?: string;
  password?: string;
}

interface TokenPair {
  access?: string;
  refresh?: string;
}

/**
 * The console and a shop sign in separately, and a token from one is refused
 * by the other. The page address decides which endpoints to use.
 *
 *   localhost:3500         -> console, /platform/auth/*
 *   rahman.localhost:3500  -> that shop, /auth/*
 */
const ROUTES = {
  tenant: { login: "/auth/login", me: "/auth/me", logout: "/auth/logout" },
  platform: {
    login: "/platform/auth/login",
    me: "/platform/auth/me",
    logout: "/platform/auth/logout",
  },
} as const;

interface MeResponse {
  id?: string;
  email?: string;
  fullName?: string;
  roles?: string[];
  activeBranch?: { id?: string; code?: string; name?: string } | null;
  organization?: { id?: string; name?: string } | null;
  permissions?: string[];
  subscription?: {
    plan?: string;
    planName?: string;
    plan_name?: string;
    status?: string;
    limits?: Record<string, number | null>;
    usage?: Record<string, number>;
  } | null;
}

/**
 * Where this account belongs.
 *
 * Decided by permission, not role name: a shop can rename "Cashier" to
 * anything.
 *
 * It used to be `dashboard.view ? "/dashboard" : "/pos"`, and that single code
 * was doing a job it cannot do. `dashboard.view` gates one WIDGET SET, and of
 * the five seeded roles only Accountant and Admin hold it — so a **Branch
 * Manager**, holding every `report.*` code, and the **Inventory** role, which
 * owns the purchase lifecycle across 42 permissions, both landed on `/pos`.
 * `proxy.ts` then wrote `sp_scope=pos` and actively redirected them away from
 * `/inventory`, `/purchases` and `/reports` — two of five roles could not use
 * the product beyond the till screen.
 *
 * The till is somebody's home only when the till is ALL they have. Anyone with
 * a back office lands on the first page of it they can actually open, so a
 * role without `dashboard.view` gets a screen with data on it rather than a
 * dashboard full of refusals.
 */
export function homeFor(permissions: string[] | undefined): string {
  if (permissions?.includes("dashboard.view")) return "/dashboard";
  return firstBackOfficePage(permissions) ?? POS_HOME;
}

/**
 * What to call somebody in a greeting. Never their email address.
 *
 * First their own first name, then the company's first word, then the part
 * before the @. Accounts created without a name fall back to the company, so
 * "Nusrat Traders" greets as "Nusrat".
 */
function greetingName(me: MeResponse): string {
  const full = (me.fullName || "").trim();
  if (full) return full.split(/\s+/)[0];

  const company = (me.organization?.name || "").trim();
  if (company) return company.split(/\s+/)[0];

  const local = (me.email || "").split("@")[0];
  if (!local) return "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** The full name, where there is room: menus, profile, account lists. */
function displayName(me: MeResponse): string {
  return (me.fullName || "").trim() || greetingName(me);
}

export class AuthService {
  /**
   * Sign in. Throws when the details are wrong.
   *
   * Worth saying, because the old version returned a fake session on failure
   * and the login page went to the dashboard whatever you typed.
   */
  static async login(payload: LoginPayload): Promise<UserSession> {
    const password = payload.password || payload.pin || "";

    const pair = await apiFetch<TokenPair>(
      ROUTES[resolveRealm()].login,
      {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ email: payload.email.trim(), password }),
      }
      // No fallback on purpose: a login that cannot reach the server has not
      // succeeded.
    );

    if (!pair?.access) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    tokenStore.set(pair.access, pair.refresh);
    const session = await AuthService.getCurrentUser();
    // The route guard cannot read permissions, so write the answer where it
    // can see it.
    // The route guard runs before the page and cannot read permissions, so
    // the answer is written where it can see it. "pos" means "has NO back
    // office" — not "has no dashboard", which is what it meant while `home`
    // could only be one of two values.
    tokenStore.setScope(session.home === POS_HOME ? "pos" : "full");
    return session;
  }

  /** The signed-in user. Throws if the token is missing or rejected. */
  static async getCurrentUser(): Promise<UserSession> {
    const me = await apiFetch<MeResponse>(ROUTES[resolveRealm()].me, { method: "GET" });

    if (!me?.id && !me?.email) {
      throw new ApiError(401, "TOKEN_INVALID", "Your session has ended. Please sign in again.");
    }

    // The server decides which branch you are in. Remember it, so later
    // requests match the token.
    if (me.activeBranch?.id) tokenStore.setBranch(me.activeBranch.id);

    return {
      id: me.id || "",
      name: displayName(me),
      greeting: greetingName(me),
      email: me.email || "",
      avatar: "/image.png",
      role: me.roles?.[0] || (resolveRealm() === "platform" ? "Platform staff" : "Staff"),
      token: tokenStore.access() || undefined,
      permissions: me.permissions ?? [],
      activeBranch: me.activeBranch?.id
        ? {
            id: me.activeBranch.id,
            code: me.activeBranch.code || "",
            name: me.activeBranch.name || "",
          }
        : null,
      home: homeFor(me.permissions),
      subscription: me.subscription
        ? {
            plan: String(me.subscription.plan ?? ""),
            planName: String(me.subscription.planName ?? me.subscription.plan_name ?? ""),
            status: String(me.subscription.status ?? ""),
            limits: toLimitMap<number | null>(
              me.subscription.limits as Record<string, number | null> | undefined
            ),
            usage: toLimitMap<number>(
              me.subscription.usage as Record<string, number> | undefined
            ),
          }
        : null,
    };
  }

  static isSignedIn(): boolean {
    return Boolean(tokenStore.access());
  }

  /** Sign out. Clears this device first, so a network failure still signs out. */
  static async logout(): Promise<void> {
    const refresh = tokenStore.refresh();
    tokenStore.clear();
    // A half-rung sale is not this device's to keep. A till is shared
    // hardware, and on a subdomain deployment the next person to sign in can
    // belong to a different company entirely.
    clearAllPosDrafts();

    if (!refresh) return;
    try {
      await apiFetch<unknown>(ROUTES[resolveRealm()].logout, {
        method: "POST",
        body: JSON.stringify({ refresh }),
      });
    } catch {
      // The tokens are already gone here. Telling the server is a bonus, not
      // a reason to stay signed in.
    }
  }

  /** A message the login form can show a person. */
  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      switch (error.code) {
        case "INVALID_CREDENTIALS":
          return "Email or password is incorrect.";
        case "ACCOUNT_LOCKED":
          return "Too many attempts. This account is locked for a while.";
        case "ACCOUNT_DISABLED":
          return "This account has been deactivated. Contact your administrator.";
        case "SUBSCRIPTION_INACTIVE":
          return "This company's subscription is not active. Contact support.";
        case "TENANT_MISMATCH":
          return "This account does not belong to this address.";
        case "REALM_MISMATCH":
          return resolveRealm() === "platform"
            ? "That is a shop account. Sign in at your company address instead."
            : "That is a SortPi staff account. Use the console sign-in.";
        case "NETWORK_ERROR":
          return "Cannot reach the server. Check it is running and try again.";
        case "THROTTLED":
          return "Too many attempts. Please wait a moment and try again.";
        default:
          return error.message || "Could not sign in. Please try again.";
      }
    }
    return "Could not sign in. Please try again.";
  }
}
