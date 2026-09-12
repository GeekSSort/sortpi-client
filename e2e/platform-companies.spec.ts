import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * The platform console's tenant list, and the one destructive thing on it.
 *
 * Closing a company stops every sign-in for it, so the only property worth
 * driving hard is that the button actually DOES it. It did not: the console
 * sent `PATCH /platform/organizations/{id}` with `is_active`, which is a
 * READ-ONLY field on that serializer — deliberately, so a business cannot be
 * locked out by the request that fixes a phone number. The PATCH answered 200,
 * changed nothing, and the console reported "Acme is now closed" over a
 * company that was still trading.
 *
 * A write that succeeds and does nothing is the worst shape a bug can take,
 * and nothing on the screen could have told anybody. So this test asserts the
 * METHOD and the PATH, not just that a toast appeared.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

const COMPANIES = [
  {
    id: "org-1",
    name: "Acme Retail",
    subdomain: "acme",
    email: "owner@acme.test",
    phone: "01700000000",
    is_active: true,
    plan: "Standard",
    subscription_status: "ACTIVE",
    user_count: 4,
    branch_count: 2,
    created_at: "2026-01-04T09:00:00Z",
  },
  {
    id: "org-2",
    name: "Shuttered Stores",
    subdomain: "shuttered",
    email: "owner@shuttered.test",
    phone: "01800000000",
    is_active: false,
    plan: "Basic",
    subscription_status: "SUSPENDED",
    user_count: 1,
    branch_count: 1,
    created_at: "2026-02-04T09:00:00Z",
  },
];

/** Answer the console's tenant endpoints, and record every write. */
async function withCompanies(page: Page) {
  const writes: string[] = [];

  await page.route(/\/api\/v1\/platform\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");

    if (path.includes("/auth/")) {
      await route.fallback();
      return;
    }
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${path} ${request.postData() || ""}`);
      await route.fulfill(ok({ ...COMPANIES[0], is_active: false }));
      return;
    }
    if (path.startsWith("/platform/organizations")) {
      await route.fulfill(ok(COMPANIES, { total: COMPANIES.length }));
      return;
    }
    if (path.startsWith("/platform/subscriptions") || path.startsWith("/platform/plans")) {
      await route.fulfill(ok([], { total: 0 }));
      return;
    }
    await route.fallback();
  });

  return writes;
}

test.describe("closing and reopening a company", () => {
  test("the list shows which companies are open", async ({ page }) => {
    await stubApi(page);
    await withCompanies(page);
    await page.goto("/platform/companies");

    await expect(page.getByText("Acme Retail").first()).toBeVisible();
    await expect(page.getByText("Shuttered Stores").first()).toBeVisible();
    // A closed company reads "Closed" whatever its subscription says — the
    // platform's own switch outranks the billing state.
    await expect(page.getByText("Closed").first()).toBeVisible();
  });

  test("closing one POSTs to the suspend endpoint, not a PATCH", async ({ page }) => {
    await stubApi(page);
    const writes = await withCompanies(page);
    await page.goto("/platform/companies");
    await expect(page.getByText("Acme Retail").first()).toBeVisible();

    await page.getByRole("button", { name: "Actions for Acme Retail" }).first().click();
    await page.getByRole("menuitem", { name: "Close company" }).click();

    // It says what actually happens, including the window a token stays alive.
    await expect(page.getByText(/fifteen minutes/i)).toBeVisible();
    await page.getByLabel("Reason for closing").fill("Unpaid since March");
    await page.getByRole("button", { name: "Close company", exact: true }).click();

    await expect.poll(() => writes.length).toBeGreaterThan(0);
    const write = writes[0];
    // The endpoint that writes an audit row and actually flips the switch.
    expect(write).toContain("POST /platform/organizations/org-1/active/");
    expect(write).toContain('"is_active":false');
    // The reason reaches the audit row. "A platform admin did it in April" is
    // not an answer to why a shop was closed.
    expect(write).toContain('"reason":"Unpaid since March"');
  });

  test("reopening one is the same endpoint the other way", async ({ page }) => {
    await stubApi(page);
    const writes = await withCompanies(page);
    await page.goto("/platform/companies");
    await expect(page.getByText("Shuttered Stores").first()).toBeVisible();

    await page
      .getByRole("button", { name: "Actions for Shuttered Stores" })
      .first()
      .click();
    // No confirm on the way back: reopening a company breaks nothing, and a
    // dialog guarding a harmless action trains people to click through the
    // ones that are not.
    await page.getByRole("menuitem", { name: "Reopen company" }).click();

    await expect.poll(() => writes.length).toBeGreaterThan(0);
    expect(writes[0]).toContain("POST /platform/organizations/org-2/active/");
    expect(writes[0]).toContain('"is_active":true');
  });
});
