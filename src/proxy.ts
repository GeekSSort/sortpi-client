import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
 * Back-office areas. A till-only account goes to /pos instead. Sign-in checks
 * `dashboard.view` and writes the answer to a cookie, because this file
 * cannot read permissions.
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
];

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
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

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
