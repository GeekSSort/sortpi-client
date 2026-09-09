import { test, expect } from "@chromatic-com/playwright";
import type { Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Every route gets an automatic Chromatic snapshot at the end of its test.
 * The sidebar and header render on all of them, so chrome regressions are
 * caught here without a dedicated per-component test.
 */
const routes = [
  ["Login", "/login"],
  ["Dashboard", "/dashboard"],
  ["CEO Overview", "/ceo-overview"],
  ["Sales & POS — POS", "/sales-pos"],
  ["Sales & POS — Sales", "/sales-pos/sales"],
  ["Sales & POS — Return", "/sales-pos/return"],
  ["Sales & POS — New return", "/sales-pos/return/new"],
  ["Customers", "/customers"],
  ["Customers — Add", "/customers/add"],
  ["Inventory — Product", "/inventory"],
  ["Inventory — Add product", "/inventory/add"],
  ["Inventory — Stock", "/inventory/stock"],
  ["Inventory — Add stock", "/inventory/stock/add"],
  ["Inventory — Transfers", "/inventory/transfers"],
  ["Purchases", "/purchases"],
  ["Purchases — Suppliers", "/purchases/suppliers"],
  ["Purchases — Add supplier", "/purchases/suppliers/add"],
  ["HRM", "/hrm"],
  ["HRM — Add employee", "/hrm/add"],
  ["HRM — Payroll", "/hrm/payroll"],
  ["Roles & Permissions", "/roles-permissions"],
  ["Roles & Permissions — Add", "/roles-permissions/add"],
  ["Settings", "/settings"],
  ["Settings — Edit", "/settings/edit"],
  ["Design system", "/ds-preview"],
] as const;

/**
 * Wait for a stable frame instead of `networkidle`, which Playwright
 * discourages and which never settles on /login (its <Link> prefetches
 * /forgot-password, a route that does not exist, so the RSC request 404s).
 * Web fonts must be resolved or text reflows after the snapshot is taken.
 */
async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Every test here signs in against a stubbed API.
 *
 * Without it the guard sends each protected route to `/login?next=…`, and
 * these tests then measured the SIGN-IN CARD while claiming to measure the
 * dashboard, the sidebar and the design-system page. They passed or failed for
 * reasons unrelated to what they name — the same vacuity `responsive.spec.ts`
 * was written with and then corrected.
 */
test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

for (const [name, path] of routes) {
  test(name, async ({ page }) => {
    await page.goto(path);
    await settle(page);
  });
}

test("Sidebar — submenu expanded", async ({ page }) => {
  await page.goto("/dashboard");
  await settle(page);
  // A section header is a button that expands its own submenu, not a link —
  // it navigates nowhere, it reveals the routes underneath it. Its name is the
  // SECTION's ("Sales & Return"); "Sales" is one of the links it reveals, and
  // asking for a button by that name found nothing.
  await page.getByRole("button", { name: "Sales & Return", exact: true }).click();
  await expect(page.getByRole("link", { name: "Return", exact: true })).toBeVisible();
});

test("Sidebar — drawer below lg", async ({ page }) => {
  // The rail is permanent from lg up; collapsing only exists below it, where the
  // sidebar is a drawer that slides in from the left rather than resizing.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await settle(page);

  const aside = page.locator("aside");
  await expect(aside).toBeVisible();
  const closed = await aside.boundingBox();
  expect(closed?.x ?? 0).toBeLessThan(0); // parked off-canvas on first paint

  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeInViewport();
  // Polled, not read once: the drawer slides in over 300ms, so a single read
  // catches it mid-transition.
  await expect.poll(async () => (await aside.boundingBox())?.x).toBe(0);
});
