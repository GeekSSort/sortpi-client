import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Ordering, moving and counting a variant that is not the default.
 *
 * A purchase line, a transfer line and a stock count each name a VARIANT.
 * Their pickers were built on `getProducts`, which returns one row per product
 * carrying the default variant only — so a shop selling Coca-Cola in three
 * sizes could raise a purchase order for exactly one of them, and the other
 * two could not be bought through the app at all. Stock could exist against
 * them and nothing could move it.
 */

const COKE = {
  id: "p-coke",
  name: "Coca-Cola",
  category: "c-1",
  category_name: "Beverages",
  brand_name: "Coke",
  is_active: true,
  images: [],
  stock_on_hand: "120.000",
  variants: [
    { id: "v-250", sku: "COKE-250", name: "250ml", is_default: true, is_active: true, price: "25.0000", barcodes: [] },
    { id: "v-500", sku: "COKE-500", name: "500ml", is_default: false, is_active: true, price: "45.0000", barcodes: [] },
    { id: "v-1l", sku: "COKE-1L", name: "1L", is_default: false, is_active: true, price: "80.0000", barcodes: [] },
  ],
};

async function stubProducts(page: Page) {
  await page.route(/\/products\/\?|\/products\/$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [COKE], total: 1 }),
    });
  });
}

test.use({ viewport: { width: 1600, height: 1000 } });

test("a purchase order can be raised for a size that is not the default", async ({ page }) => {
  await stubApi(page);
  await stubProducts(page);

  await page.goto("/purchases/add");

  // The picker opens on focus — it is a search box, not a button.
  await page.getByLabel("Product to order").click();

  // All three sizes offered, not just the default. Before the fix only
  // "250ml" existed here and the other two were unreachable.
  await expect(page.getByText("COKE-250", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("COKE-500", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("COKE-1L", { exact: false }).first()).toBeVisible();

  // Order the 500ml specifically.
  await page.getByText("COKE-500", { exact: false }).first().click();

  // It lands on the order as the 500ml, not as "Coca-Cola".
  await expect(page.getByText("500ml", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
});

test("the products list says a row is a summary of several sizes", async ({ page }) => {
  await stubApi(page);
  await stubProducts(page);

  await page.goto("/inventory");

  // One row per PRODUCT — a catalogue, not a stock list — but the row's price
  // is the default variant's while its stock is every variant summed, so it
  // has to say it is a summary.
  await expect(page.getByText("3 variants", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
});
