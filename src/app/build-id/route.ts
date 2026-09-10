/**
 * The commit this bundle was built from, in plain text.
 *
 * A deploy used to report success without changing anything, and there was no
 * way to tell from outside: the pipeline's own check asked for a route that
 * existed in the OLD build too, so it passed either way. Green meant "the site
 * answers", not "the site is what we just built".
 *
 * This is the difference. CI passes the commit in as a build arg, the value is
 * baked in here, and the verify step asserts the live site returns the SHA it
 * just deployed. A deploy that does not land now fails instead of lying.
 *
 * `force-static` so it is evaluated once at build time — the value cannot
 * change while the container runs, and reading it per request would be a
 * request that does nothing.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(process.env.NEXT_PUBLIC_BUILD_SHA || "unknown", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
