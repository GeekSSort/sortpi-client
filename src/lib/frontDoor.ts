/**
 * Where the bare domain sends a signed-out visitor.
 *
 * Three deployments, three right answers, and getting it from one boolean was
 * how the first version of this went wrong:
 *
 *   * The PLATFORM apex (`sortpi.com`) exists so a new company can register.
 *     Somebody typing it almost never wants to sign in to an account they do
 *     not have, and /login offers sign-up only as a link under the button.
 *
 *   * A COMPANY's address (`nusrat.sortpi.com`) belongs to a shop whose staff
 *     are signing in. Registering a new company from somebody else's front
 *     door is exactly the mix-up `realmUrl` exists to prevent.
 *
 *   * A SINGLE-TENANT deployment — no base domain configured, one shop on one
 *     domain — has no apex to register at. Sending its visitors to /signup
 *     would invite strangers to create companies on a shop's own address, and
 *     it is a regression from the /login that was there before.
 *
 * Pure, and in its own module rather than inside `proxy.ts`, so all three can
 * be asserted without standing up a deployment for each.
 */

export function frontDoor({
  host,
  baseDomain,
  platformHosts,
}: {
  /** The Host header, port included or not. */
  host: string | null;
  /** `NEXT_PUBLIC_PLATFORM_BASE_DOMAIN`. Empty means subdomains are off. */
  baseDomain: string | undefined;
  /** `NEXT_PUBLIC_PLATFORM_HOSTS`, comma separated. */
  platformHosts: string | undefined;
}): "/signup" | "/login" {
  const base = (baseDomain || "").trim().toLowerCase();
  // No tenancy configured: one shop, one domain, and no apex to register at.
  if (!base) return "/login";

  // The Host header carries the port; the base domain does not.
  const name = (host || "").toLowerCase().split(":")[0];
  if (!name) return "/login";

  if (name === base) return "/signup";

  const extra = (platformHosts || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (extra.includes(name)) return "/signup";

  // Everything else: a company's subdomain, or a host this deployment was
  // never told about. Sign-in is right for the first and the safe answer for
  // the second — an unknown door must not offer to create companies.
  return "/login";
}
