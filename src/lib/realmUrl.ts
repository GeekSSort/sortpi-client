"use client";

import { useSyncExternalStore } from "react";

/**
 * Addresses that cross from one company to another, or to the platform.
 *
 * Most links in this app are relative and should be: a page inside Nusrat's
 * shop links to another page inside Nusrat's shop. A handful are not, and every
 * one of them was written by hand or — worse — written as a relative link that
 * silently stayed on the wrong host:
 *
 *   * "Create an account" on the sign-in page pointed at `/signup`. On
 *     `nusrat.sortpi.com` that is `nusrat.sortpi.com/signup`, so somebody
 *     registering a NEW company did it from an EXISTING company's front door.
 *     Sign-up belongs to the platform, which is the whole reason the apex
 *     exists.
 *
 *   * The end of sign-up has to send the new owner to an address that did not
 *     exist a moment ago. That was built by taking the last two labels of
 *     `window.location.hostname`, which is right for `sortpi.com` and wrong for
 *     `sortpi.co.uk`, for `app.sortpi.com`, and for any deployment whose base
 *     domain is not exactly two labels.
 *
 * So the rule lives here once, and it reads the SAME configuration the API
 * client resolves the realm from — `NEXT_PUBLIC_PLATFORM_BASE_DOMAIN` — rather
 * than inferring it from whatever host the page happens to be on.
 *
 * With no base domain configured — the supported single-tenant deployment —
 * every function returns the RELATIVE path it was given. Nothing changes for a
 * deployment that does not use subdomains, which is the same compatibility
 * story `PLATFORM_BASE_DOMAIN` has on the server.
 */

function baseDomain(): string {
  return (process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN || "").trim().toLowerCase();
}

/** Scheme and port of the page we are on; the host is what changes. */
function schemeAndPort(): { protocol: string; port: string } | null {
  if (typeof window === "undefined") return null;
  const { protocol, host } = window.location;
  // `host` carries the port when there is one and omits it on 80/443, which is
  // exactly the behaviour we want to copy onto the new host.
  const colon = host.lastIndexOf(":");
  // An IPv6 literal is bracketed; its colons are inside the brackets.
  const port = colon > host.lastIndexOf("]") ? host.slice(colon) : "";
  return { protocol, port };
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * The platform's own address — the apex, where a new company signs up.
 *
 * Returns the relative path when subdomains are switched off, and when there is
 * no `window` (server render): a relative href is correct on the apex and
 * harmless everywhere, and it is what this returned before the base domain was
 * read at all.
 */
export function platformHref(path: string): string {
  const relative = withLeadingSlash(path);
  const base = baseDomain();
  const location = schemeAndPort();
  if (!base || !location) return relative;
  return `${location.protocol}//${base}${location.port}${relative}`;
}

/** One company's address. `subdomain` is the label, not the whole host. */
export function tenantHref(subdomain: string, path: string): string {
  const relative = withLeadingSlash(path);
  const base = baseDomain();
  const location = schemeAndPort();
  const label = (subdomain || "").trim().toLowerCase();
  if (!base || !location || !label) return relative;
  return `${location.protocol}//${label}.${base}${location.port}${relative}`;
}

/**
 * True when the page is on a company's address rather than the platform's.
 *
 * Deliberately a separate reading from `resolveRealm()` in `apiClient`, which
 * answers the same question for a different purpose (which login endpoint to
 * call). They agree by construction — both read the same environment variable —
 * and a page that needs to REDIRECT wants a boolean it can use during render.
 */
export function onTenantHost(): boolean {
  const base = baseDomain();
  if (!base || typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host === base) return false;
  const platformHosts = (process.env.NEXT_PUBLIC_PLATFORM_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (platformHosts.includes(host)) return false;
  return host.endsWith(`.${base}`) && host.slice(0, -(base.length + 1)).length > 0;
}


/** Never changes for the life of a page: the host cannot change under us. */
const NEVER = () => () => {};

/**
 * `onTenantHost()` as a hook, safe to read during render.
 *
 * The obvious `useState(false)` plus an effect is what this replaced, and the
 * React compiler rejects it — a setState in an effect body causes a cascading
 * render, and the value it computes never changes anyway. `useSyncExternalStore`
 * is the pattern the sign-in page already uses for exactly this: a steady
 * server answer, the real one in the browser, and no flash between them.
 *
 * The server snapshot is `false`, which renders the ordinary page — the same
 * markup as a deployment with no subdomains, so hydration matches there.
 */
export function useOnTenantHost(): boolean {
  return useSyncExternalStore(NEVER, onTenantHost, () => false);
}

/** True when subdomain tenancy is configured at all. */
export function subdomainsEnabled(): boolean {
  return Boolean(baseDomain());
}

/** `subdomainsEnabled() && !onTenantHost()` — i.e. "on the platform address". */
export function useOnPlatformHost(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => subdomainsEnabled() && !onTenantHost(),
    () => false
  );
}
