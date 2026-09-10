import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * What a shop takes, and what a plan change does not do.
 *
 * Two changes that share a cause — nothing here can charge anybody yet — and
 * one contract between three screens:
 *
 *   Settings ticks the tenders  ->  the till offers exactly those  ->  the
 *   checkout books each one under the right `PaymentMethod`.
 *
 * The old version of that contract was a comma-separated text box, so the till
 * and the settings screen could disagree about what a shop accepted and did.
 * These drive the real screens, because the interesting failures are wiring —
 * a box that ticks but is not saved, a saved list the till ignores — and none
 * of them are visible to a unit test of the parser.
 */

/** The envelope the stub answers in, so overrides look like the real thing. */
function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data, ...extra }) };
}

const PLANS = [
  { code: "starter", name: "Starter", description: "", price: "1500.0000", interval: "MONTHLY", trial_days: 0, max_branches: 1, max_users: 5, max_products: 500 },
  { code: "standard", name: "Standard", description: "", price: "3500.0000", interval: "MONTHLY", trial_days: 0, max_branches: 3, max_users: 15, max_products: 5000 },
  { code: "premium", name: "Premium", description: "", price: "7500.0000", interval: "MONTHLY", trial_days: 0, max_branches: null, max_users: null, max_products: null },
];

/** A company on Starter and out of room, so every dearer plan is offerable. */
const SUBSCRIPTION = {
  plan: "starter",
  plan_name: "Starter",
  status: "ACTIVE",
  limits: { max_branches: 1, max_users: 5, max_products: 500 },
  usage: { max_branches: 1, max_users: 5, max_products: 120 },
};

/**
 * Layer on top of `stubApi`. Playwright runs the LAST registered handler
 * first, so everything here wins over the shared stub without editing it.
 */
async function withBilling(page: Page) {
  const upgradeCalls: string[] = [];

  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");

    if (path.includes("/subscription/upgrade")) {
      // Recorded, then answered as a SUCCESS. Answering with an error would
      // let a dialog that still calls the endpoint pass this test by showing
      // its own failure message; a success means the only way the plan stays
      // put is for the call never to be made.
      upgradeCalls.push(route.request().postData() || "");
      await route.fulfill(ok({ plan: "premium" }));
      return;
    }
    if (path.startsWith("/billing/plans")) {
      await route.fulfill(ok(PLANS, { total: PLANS.length }));
      return;
    }
    await route.fallback();
  });

  return upgradeCalls;
}

test.describe("a plan change is requested, not made", () => {
  test("confirming shows the payment notice and never calls the endpoint", async ({ page }) => {
    await stubApi(page, { subscription: SUBSCRIPTION });
    const upgradeCalls = await withBilling(page);

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Upgrade" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Move up a plan")).toBeVisible();
    // The usage line: the reason somebody opened this at all.
    await expect(dialog.getByText("5 / 5")).toBeVisible();

    // The current plan is not selectable; the ones above it are.
    await expect(dialog.getByRole("button", { name: /Starter/ })).toBeDisabled();

    await dialog.getByRole("button", { name: /Premium/ }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // The notice, naming the plan asked for and the plan still held.
    await expect(dialog.getByText("Payment method required")).toBeVisible();
    await expect(dialog.getByText(/has not been changed/)).toBeVisible();
    await expect(dialog.getByText("Premium", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/You will keep Starter/)).toBeVisible();

    // The point of the whole change.
    expect(upgradeCalls).toEqual([]);
  });

  test("back to plans returns to the list, and reopening starts clean", async ({ page }) => {
    await stubApi(page, { subscription: SUBSCRIPTION });
    const upgradeCalls = await withBilling(page);

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Upgrade" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Standard/ }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog.getByText("Payment method required")).toBeVisible();

    await dialog.getByRole("button", { name: "Back to plans" }).click();
    await expect(dialog.getByText("Move up a plan")).toBeVisible();

    // Closing and reopening must not show the last request's notice again.
    await dialog.getByRole("button", { name: "Got it" }).or(dialog.getByRole("button", { name: "Cancel" })).first().click();
    await page.getByRole("button", { name: "Upgrade" }).first().click();
    await expect(dialog.getByText("Move up a plan")).toBeVisible();
    await expect(dialog.getByText("Payment method required")).toHaveCount(0);
    // Nothing selected, so there is nothing to confirm.
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();

    expect(upgradeCalls).toEqual([]);
  });
});

const ORG = [{ id: "o-1", name: "Acme Retail", email: "", phone: "", address: "", tax_number: "", currency_code: "BDT", currency_symbol: "৳" }];

/**
 * Settings with a stored tender list, and a record of what gets written back.
 *
 * `stored` is the raw setting value, spelled however a shop happens to have
 * spelled it — the free-text box that used to be here means the messy ones are
 * real data, not hypotheticals.
 */
async function withSettings(page: Page, stored: string) {
  const writes: { key: string; value: string }[] = [];
  const rows = [
    { id: "s-1", key: "tax.default_rate", value: "0.15", resolved_from: "ORG" },
    { id: "s-2", key: "tax.inclusive_by_default", value: "true", resolved_from: "ORG" },
    { id: "s-3", key: "pos.max_discount_percent", value: "0.20", resolved_from: "ORG" },
    { id: "s-4", key: "pos.online_payment_methods", value: stored, resolved_from: "ORG" },
  ];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, "");

    if (path.startsWith("/settings/resolved")) {
      await route.fulfill(ok(rows.map(({ key, value, resolved_from }) => ({ key, value, resolved_from }))));
      return;
    }
    // The list `setValue` reads to decide PATCH-or-POST.
    if (path.startsWith("/settings/") && request.method() === "PATCH") {
      const id = path.replace(/\/$/, "").split("/").pop();
      const value = String(JSON.parse(request.postData() || "{}").value ?? "");
      const row = rows.find((r) => r.id === id);
      if (row) {
        row.value = value;
        writes.push({ key: row.key, value });
      }
      await route.fulfill(ok({ id, value }));
      return;
    }
    if (path.startsWith("/settings")) {
      await route.fulfill(ok(rows, { total: rows.length, page: 1, limit: 200 }));
      return;
    }
    if (path.startsWith("/organizations")) {
      await route.fulfill(request.method() === "PATCH" ? ok(ORG[0]) : ok(ORG, { total: 1 }));
      return;
    }
    await route.fallback();
  });

  return writes;
}

/** The label on a box, since the code and the label differ for cards. */
const BOX = {
  bKash: "bKash",
  Nagad: "Nagad",
  Rocket: "Rocket",
  Upay: "Upay",
  Card: "Card (Visa / Mastercard)",
  Bank: "Bank Transfer",
  Cheque: "Cheque",
  Others: "Others",
} as const;

test.describe("the shop's payment methods are ticked, not typed", () => {
  test("the Bangladeshi methods are all offered as boxes", async ({ page }) => {
    await stubApi(page);
    await withSettings(page, "Card, bKash, Nagad, Rocket, Bank Transfer, Others");
    await page.goto("/settings");

    for (const label of Object.values(BOX)) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // The free-text box is gone: it is what let one typo remove a tender.
    await expect(page.getByPlaceholder("Card, bKash, Nagad, Rocket, Bank Transfer, Others")).toHaveCount(0);
  });

  test("a shop's messy free-text list ticks the right boxes", async ({ page }) => {
    await stubApi(page);
    // The spellings a text box allowed: casing, spacing, a brand written out.
    await withSettings(page, "  bkash , VISA/MASTERCARD ,bank , Due on delivery ");
    await page.goto("/settings");

    const ticked = (label: string) =>
      page.locator("label").filter({ hasText: label }).locator("input[type=checkbox]").first();

    await expect(ticked(BOX.bKash)).toBeChecked();
    await expect(ticked(BOX.Card)).toBeChecked();
    await expect(ticked(BOX.Bank)).toBeChecked();
    await expect(ticked(BOX.Nagad)).not.toBeChecked();
    await expect(ticked(BOX.Rocket)).not.toBeChecked();

    // The shop's own tender is shown and kept, not silently dropped.
    await expect(ticked("Due on delivery")).toBeChecked();
  });

  test("ticking and saving writes the catalogue's spelling in box order", async ({ page }) => {
    await stubApi(page);
    const writes = await withSettings(page, "bkash, VISA/MASTERCARD");
    await page.goto("/settings");

    const ticked = (label: string) =>
      page.locator("label").filter({ hasText: label }).locator("input[type=checkbox]").first();

    await ticked(BOX.Nagad).check();
    await ticked(BOX.Cheque).check();
    await ticked(BOX.Card).uncheck();

    await page.getByRole("button", { name: /Save Changes/ }).click();
    await expect(page.getByText("Settings saved successfully!")).toBeVisible();

    const written = writes.find((w) => w.key === "pos.online_payment_methods");
    // Catalogue order, catalogue spelling — "bkash" went in, "bKash" came out.
    expect(written?.value).toBe("bKash, Nagad, Cheque");
  });

  test("saving no methods at all is refused rather than emptying the till", async ({ page }) => {
    await stubApi(page);
    const writes = await withSettings(page, "bKash, Nagad");
    await page.goto("/settings");

    const ticked = (label: string) =>
      page.locator("label").filter({ hasText: label }).locator("input[type=checkbox]").first();
    await ticked(BOX.bKash).uncheck();
    await ticked(BOX.Nagad).uncheck();

    await page.getByRole("button", { name: /Save Changes/ }).click();
    await expect(page.getByText(/Tick at least one payment method/)).toBeVisible();
    expect(writes).toEqual([]);
  });
});

/**
 * The three things `PosService.checkout` arranges before it will sell: a
 * warehouse to sell out of, a customer to sell to, an open shift to sell in.
 *
 * Local to this file rather than added to `stubApi`, which answers these with
 * empty lists on purpose — an empty list is the state several other specs are
 * measuring, and stock in particular decides whether a tile renders enabled or
 * greyed, which the visual archives are baselined on.
 *
 * Returns the sale payloads that reached the wire.
 */
async function withTill(page: Page) {
  const checkouts: Record<string, any>[] = [];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, "");

    if (path.startsWith("/sales") && request.method() === "POST") {
      checkouts.push(JSON.parse(request.postData() || "{}"));
      await route.fulfill(
        ok({ id: "sale-1", invoice_number: "INV-1", grand_total: "100.0000", payments: [] })
      );
      return;
    }
    if (path.startsWith("/warehouses")) {
      await route.fulfill(ok([{ id: "w-1", name: "Dhaka Main", branch: "b-1", type: "MAIN" }], { total: 1 }));
      return;
    }
    // `warehouse` matters: `stockOnThisTill` drops any row belonging to
    // another one, and a dropped row is a tile that renders sold out and
    // DISABLED — which is a POS test that can click nothing.
    if (path.startsWith("/inventory/stock")) {
      await route.fulfill(
        ok(
          Array.from({ length: 30 }, (_, i) => ({
            sku: `SKU-${i + 1}`,
            variant: `v-${i + 1}`,
            warehouse: "w-1",
            available: "50.0000",
          })),
          { total: 30 }
        )
      );
      return;
    }
    if (path.startsWith("/pos/shifts")) {
      await route.fulfill(ok({ id: "sh-1", status: "OPEN" }));
      return;
    }
    if (path.startsWith("/customers")) {
      await route.fulfill(
        ok([{ id: "c-walkin", code: "CUS-WALKIN", name: "Walk-in Customer", customer_type: "RETAIL", is_active: true }], { total: 1 })
      );
      return;
    }
    await route.fallback();
  });

  return checkouts;
}

test.describe("the till offers exactly what Settings ticked", () => {
  /** Ring one product up and open the Pay Online dialog. */
  async function payOnline(page: Page) {
    await page.goto("/pos");
    const tile = page.getByRole("button").filter({ hasText: "Product 01" }).first();
    await expect(tile).toBeEnabled();
    await tile.click();
    const pay = page.getByRole("button", { name: "Pay Online" });
    await expect(pay).toBeEnabled();
    await pay.click();
    return page.getByRole("dialog");
  }

  test("only the configured methods appear, in the configured order", async ({ page }) => {
    await stubApi(page);
    await withSettings(page, "Nagad, bKash, Bank Transfer");
    await withTill(page);

    const dialog = await payOnline(page);
    await expect(dialog.getByText("Select Payment Method")).toBeVisible();

    const options = dialog.locator("div.grid > button");
    await expect(options).toHaveText(["Nagad", "bKash", "Bank Transfer"]);

    // The ones this shop turned off are not on the till at all.
    await expect(dialog.getByRole("button", { name: "Rocket" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /^Card$/ })).toHaveCount(0);
  });

  test("a shop's own tender reaches the till and is booked as OTHER", async ({ page }) => {
    await stubApi(page);
    await withSettings(page, "Cheque, Due on delivery");
    const checkouts = await withTill(page);

    const dialog = await payOnline(page);
    const options = dialog.locator("div.grid > button");
    await expect(options).toHaveText(["Cheque", "Due on delivery"]);

    // A cheque is bank money, not card money. The old substring ladder in
    // `PosService.checkout` ended in `return "CARD"`, so both of these were
    // booked as card takings and no terminal reconciliation could balance.
    await dialog.getByRole("button", { name: "Cheque" }).click();
    await dialog.getByRole("button", { name: /^Confirm/ }).click();
    await expect.poll(() => checkouts.length).toBeGreaterThan(0);
    expect(checkouts[0].payments[0].payment_method).toBe("BANK");
    expect(checkouts[0].payments[0].payment_provider).toBe("Cheque");
  });
});
