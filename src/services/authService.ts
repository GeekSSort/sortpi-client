import { apiFetch, tokenStore, ApiError, resolveRealm } from "./apiClient";

export interface UserSession {
  id: string;
  /** Permission codes the server worked out for this branch. */
  permissions: string[];
  /** Where this person lands, and stays. */
  home: "/pos" | "/dashboard";
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
  token?: string;
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
}

/**
 * Where this account belongs.
 *
 * Decided by permission, not role name: a shop can rename "Cashier" to
 * anything. Without `dashboard.view` every back-office panel comes back
 * empty, so the till is the right place to land.
 */
export function homeFor(permissions: string[] | undefined): "/pos" | "/dashboard" {
  return permissions?.includes("dashboard.view") ? "/dashboard" : "/pos";
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
    tokenStore.setScope(session.home === "/pos" ? "pos" : "full");
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
    };
  }

  static isSignedIn(): boolean {
    return Boolean(tokenStore.access());
  }

  /** Sign out. Clears this device first, so a network failure still signs out. */
  static async logout(): Promise<void> {
    const refresh = tokenStore.refresh();
    tokenStore.clear();

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
            : "That is a SORTPoint staff account. Use the console sign-in.";
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
