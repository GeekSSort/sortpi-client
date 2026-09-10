import { defineConfig, devices } from "@playwright/test";

const PORT = 3500;
const baseURL = `http://localhost:${PORT}`;

/**
 * Visual regression via Chromatic. `npx playwright test` writes an archive of
 * each page under test-results/**\/chromatic-archives; `npm run chromatic`
 * uploads them. See e2e/visual.spec.ts.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    // Signed in. The route guard sends an anonymous visitor to /login, so
    // without this every test asserting on /dashboard measures the login page.
    // These cookies carry no token — the guard is a signpost, and nothing here
    // reaches the API.
    storageState: {
      cookies: [
        { name: "sp_session", value: "1", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const },
        { name: "sp_scope", value: "full", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const },
      ],
      origins: [],
    },
    trace: "on-first-retry",
    // Match the Figma frame height so the sidebar renders full-length.
    viewport: { width: 1440, height: 1078 },
  },

  projects: [
    // Chromium only: Chromatic re-renders the uploaded archives in its own
    // browsers, so capturing locally in more than one is wasted work.
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    // A production build, not `next dev` — no HMR overlay or dev-only markup
    // leaking into the baselines.
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    /**
     * The tenancy configuration the suite asserts against.
     *
     * `.env.local` is untracked, so a developer had these and CI did not, and
     * "the platform's root opens on sign-up" passed here and failed there:
     * `frontDoor` reads an unset `NEXT_PUBLIC_PLATFORM_BASE_DOMAIN` as "no
     * tenancy configured" and sends the apex to /login, which is the right
     * answer for a single-tenant deployment and the wrong one for the
     * deployment these tests describe. Setting it here makes the run say which
     * deployment it is testing instead of inheriting one.
     *
     * `NEXT_PUBLIC_*` is inlined at build time and the command builds, so
     * these reach both the bundle and the route guard. Next leaves variables
     * already present in `process.env` alone, so this wins over `.env.local`
     * and the two machines run the same deployment.
     *
     * `localhost` is the base domain because `baseURL` is on it: the Host
     * header is `localhost:3500`, and `frontDoor` drops the port.
     */
    env: {
      NEXT_PUBLIC_PLATFORM_BASE_DOMAIN: "localhost",
      NEXT_PUBLIC_PLATFORM_HOSTS: "localhost,127.0.0.1",
    },
  },
});
