import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { frontDoor } from "@/lib/frontDoor";

/**
 * Route guard. Called `proxy.ts` because Next 16 dropped `middleware.ts` —
 * same job, new filename.
 *
 * It runs before the page, so it reads cookies, not localStorage. It is a
 * signpost, not the lock: the API refuses the requests anyway. It stops
 * someone typing /dashboard and landing inside the app.
 */

const SESSION_COOKIE = "sp_session";
const SCOPE_COOKIE = "sp_scope";

/**
 * Back-office areas. A till-only account goes to /pos instead.
 *
 * Sign-in writes the answer to the `sp_scope` cookie, because this file runs
 * before the page and cannot read permissions. What it writes is "does this
 * account have ANY back office" — `src/lib/pageAccess.ts` decides that from
 * the page-to-permission map.
 *
 * It used to be `dashboard.view` alone, and only two of the five seeded roles
 * hold that code: a Branch Manager and the Inventory role were both marked
 * `pos` here and then redirected away from `/inventory`, `/purchases` and
 * `/reports` — the pages their permissions exist for.
 */
const BACK_OFFICE = [
  "/dashboard",
  "/ceo-overview",
  "/customers",
  "/inventory",
  "/purchases",
  "/hrm",
  "/roles-permissions",
  "/settings",
  "/sales-pos",
  // Reports and Discount in the back office's own shell. A cashier already has
  // both in the POS shell and belongs there, so these copies are back office
  // like the rest. /pos is NOT here: it is the one address both roles share,
  // and the layout picks the frame.
  "/reports",
  "/discount",
];

/**
 * The POS shell for a cashier, the main menu for everyone else.
 *
 * Someone with a back office reaches these screens from their own sidebar, so
 * sending them into the till's environment would swap their menu for a smaller
 * one and take the whole window. Old links and bookmarks land on the
 * back-office copy instead of a shell they no longer use.
 */
const POS_TO_BACK_OFFICE: Record<string, string> = {
  "/pos/sales": "/sales-pos/sales",
  "/pos/return": "/sales-pos/return",
  "/pos/customers": "/customers",
  "/pos/products": "/inventory",
  "/pos/reports": "/reports",
  "/pos/discount": "/discount",
  "/pos/settings": "/settings",
};

/** The longest mapped prefix, so /pos/sales does not match /pos first. */
function backOfficeEquivalent(pathname: string): string | null {
  const hit = Object.keys(POS_TO_BACK_OFFICE)
    .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? POS_TO_BACK_OFFICE[hit] : null;
}

/** Pages a signed-out person may see. Everything else needs a session. */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/verify-code",
  "/set-password",
  "/forgot-password",
  "/platform/forgot-password",
  "/accept-invitation",
];

/**
 * Outside the guard: not a sign-in page, so a signed-in visitor should not be
 * pushed away from it either. It draws components with no data.
 */
const UNGUARDED = ["/ds-preview"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (UNGUARDED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const signedIn = request.cookies.get(SESSION_COOKIE)?.value === "1";

  // Signed in and heading for the login page: send them where they meant to go.
  if (signedIn && isPublic(pathname)) {
    const next = request.nextUrl.searchParams.get("next");
    const home = request.cookies.get(SCOPE_COOKIE)?.value === "pos" ? "/pos" : "/dashboard";
    return NextResponse.redirect(new URL(next || home, request.url));
  }

  if (signedIn) {
    // A till-only account has no back office to go to.
    const posOnly = request.cookies.get(SCOPE_COOKIE)?.value === "pos";
    const wantsBackOffice = BACK_OFFICE.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
    if (posOnly && wantsBackOffice) {
      return NextResponse.redirect(new URL("/pos", request.url));
    }
    // And the other way round: the till's environment is the cashier's, not
    // the back office's.
    if (!posOnly) {
      const equivalent = backOfficeEquivalent(pathname);
      if (equivalent) return NextResponse.redirect(new URL(equivalent, request.url));
    }
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  /**
   * The bare domain, signed out.
   *
   * On the PLATFORM address that is somebody who typed sortpi.com, and what
   * they want is almost never to sign in to an account they do not have — the
   * apex exists so a new company can register. It sent them to /login, which
   * is a form they cannot fill in and which offers sign-up only as a link
   * below the button.
   *
   * On a COMPANY's address it is the opposite: nusrat.sortpi.com belongs to a
   * shop whose staff are signing in, and registering a new company from
   * somebody else's front door is the mix-up `realmUrl` exists to prevent. So
   * that host still opens on /login — and so does a SINGLE-TENANT deployment,
   * which has no apex to register at at all. `frontDoor` owns all three.
   *
   * Only for `/` — a signed-out visitor asking for any other page is still
   * sent to sign in with `next` set, so the link they followed still works.
   */
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(
        frontDoor({
          host: request.headers.get("host"),
          baseDomain: process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN,
          platformHosts: process.env.NEXT_PUBLIC_PLATFORM_HOSTS,
        }),
        request.url
      )
    );
  }

  // Remember where they were going, so signing in takes them there instead of
  // to the dashboard.
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Everything except Next's own files and anything with an extension.
   * Without this it also runs on CSS and images, and the redirect above stops
   * them loading.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
