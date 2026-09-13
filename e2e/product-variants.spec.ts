import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * A product with more than one variant, at the till.
 *
 * The server has been variant-keyed since it was built — stock, prices,
 * barcodes, sale lines and purchase lines all hang off `ProductVariant`, never
 * off Product. The client threw that away in one line: the mapper took
 * `variants.find(isDefault) || variants[0]` and returned a single item, so a
 * Coca-Cola with 250ml, 500ml and 1L reached the till as ONE tile at ONE
 * price. Stock counted against the other two was unreachable from any screen
 * in the app.
 *
 * These assert the two halves of the fix: every variant is offered, and no two
 * of them are ever treated as the same thing.
 */

const COKE = {
  id: "p-coke",
  name: "Coca-Cola",
  category: "c-1",
  category_name: "Beverages",
  is_active: true,
  images: [],
  variants: [
    { id: "v-250", sku: "COKE-250", name: "250ml", is_default: true, is_active: true, price: "25.0000", barcodes: [] },
    { id: "v-500", sku: "COKE-500", name: "500ml", is_default: false, is_active: true, price: "45.0000", barcodes: [] },
    { id: "v-1l", sku: "COKE-1L", name: "1L", is_default: false, is_active: true, price: "80.0000", barcodes: [] },
    // Retired: a size the shop no longer stocks. It must not be sellable.
    { id: "v-2l", sku: "COKE-2L", name: "2L", is_default: false, is_active: false, price: "140.0000", barcodes: [] },
  ],
};

async function stubCatalogue(page: Page) {
  await page.route(/\/inventory\/stock/, async (route) => {
    const rows = COKE.variants.map((v) => ({ sku: v.sku, available: "40.000" }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: rows, total: rows.length }),
    });
  });
  await page.route(/\/products\/\?|\/products\/$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [COKE], total: 1 }),
    });
  });
}

test.use({ viewport: { width: 1600, height: 1000 } });

test.describe("a product with several variants", () => {
  test("every sellable size gets its own tile, and the retired one does not", async ({ page }) => {
    await stubApi(page);
    await stubCatalogue(page);
    await page.goto("/pos");

    // Three tiles, all named Coca-Cola, told apart by the variant beneath.
    await expect(page.getByText("250ml", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("500ml", { exact: true })).toBeVisible();
    await expect(page.getByText("1L", { exact: true })).toBeVisible();
    // `is_active: false` is how a shop retires a size. Selling it must be
    // impossible, not merely discouraged.
    await expect(page.getByText("2L", { exact: true })).toHaveCount(0);

    // Each at its OWN price — the bug served every size at the default's.
    await expect(page.getByText("৳ 25.00").first()).toBeVisible();
    await expect(page.getByText("৳ 45.00").first()).toBeVisible();
    await expect(page.getByText("৳ 80.00").first()).toBeVisible();
  });

  test("two sizes are two cart lines, never one", async ({ page }) => {
    await stubApi(page);
    await stubCatalogue(page);
    await page.goto("/pos");

    // BY THE TILE, not by the text. The size now shows on the cart line as
    // well as on the shelf tile, so a bare `getByText("250ml")` matches both
    // the moment the first one is rung up — and the second click would be on
    // the cart, which is not a way to add anything.
    const tile = (size: string) =>
      page.getByRole("button", { name: new RegExp(`Coca-Cola ${size}`) }).first();

    await tile("250ml").click();
    await tile("500ml").click();

    // Two lines, each with its own quantity control. Keyed on the VARIANT id,
    // so adding a second size can never increment the first.
    await expect(page.getByRole("button", { name: "Increase quantity" })).toHaveCount(2, {
      timeout: 10_000,
    });

    // And the same size twice is still one line at quantity 2 — the other half
    // of the same rule.
    await tile("250ml").click();
    await expect(page.getByRole("button", { name: "Increase quantity" })).toHaveCount(2);
  });
});
