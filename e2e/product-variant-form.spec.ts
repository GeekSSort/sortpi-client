import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Adding a product that is sold in several sizes.
 *
 * The server has always accepted a `variants` list; the form had nowhere to
 * type one, so every product created through the app had exactly one variant
 * called "Default" and a shop simply could not express "Coca-Cola, in 250ml
 * and 500ml".
 *
 * These assert the BODY that goes up, not just the fields on screen: the
 * failure worth catching is a form that looks right and posts the old shape.
 */

const UNITS = [{ id: "u-pcs", name: "Piece", short_name: "pcs", allow_decimal: false }];
const CATS = [{ id: "c-1", name: "Beverages", slug: "beverages" }];

async function stubForm(page: Page, onPost: (body: any) => void) {
  await page.route(/\/units/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: UNITS, total: 1 }) })
  );
  await page.route(/\/categories/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: CATS, total: 1 }) })
  );
  await page.route(/\/settings\/resolved/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) })
  );
  await page.route(/\/products\/$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() || "{}");
    onPost(body);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "p-new",
          name: body.name,
          variants: (body.variants ?? []).map((v: any, i: number) => ({
            id: `v-${i}`,
            name: v.name,
            sku: v.sku ?? `AUTO-${i}`,
            is_default: !!v.is_default,
          })),
          images: [],
        },
      }),
    });
  });
}

async function fillBasics(page: Page) {
  await page.getByPlaceholder("Enter product name").fill("Coca-Cola");
  await page.getByRole("button", { name: /Select product category/ }).first().click();
  await page.getByText("Beverages", { exact: true }).first().click();
}

test.describe("adding a product sold in several sizes", () => {
  test("posts one variant row per size, each with its own SKU and prices", async ({ page }) => {
    let posted: any = null;
    await stubApi(page);
    await stubForm(page, (b) => (posted = b));

    await page.goto("/inventory/add");
    await fillBasics(page);

    await page.getByRole("button", { name: "Sold in several sizes?" }).click();

    // The product-level boxes go away: every one of them is a VARIANT's field
    // with nowhere else to live on a single-variant product, and two boxes for
    // one price is how the two come to disagree.
    await expect(page.locator("#p-selling")).toHaveCount(0);
    await expect(page.locator("#p-purchase")).toHaveCount(0);
    await expect(page.locator("#p-opening")).toHaveCount(0);
    await expect(page.locator("#p-sku")).toHaveCount(0);
    await expect(page.locator("#p-barcode")).toHaveCount(0);
    // And so does the Final Price, which was computed from the box that left.
    await expect(page.getByLabel("Final price")).toHaveCount(0);

    await page.getByLabel("Variant 1 name").fill("250ml");
    await page.getByLabel("Variant 1 SKU").fill("COKE-250");
    await page.getByLabel("Variant 1 barcode").fill("8901234500250");
    await page.getByLabel("Variant 1 selling price").fill("25");
    await page.getByLabel("Variant 2 name").fill("500ml");
    await page.getByLabel("Variant 2 SKU").fill("COKE-500");
    await page.getByLabel("Variant 2 barcode").fill("8901234500500");
    await page.getByLabel("Variant 2 selling price").fill("45");

    await page.getByRole("button", { name: "Save Product" }).click();

    await expect.poll(() => posted, { timeout: 15_000 }).not.toBeNull();

    // VARIABLE, because `type` is what governs how many variants a product
    // may have — SIMPLE with two is refused by the server.
    expect(posted.type).toBe("VARIABLE");
    expect(posted.variants).toHaveLength(2);
    expect(posted.variants[0]).toMatchObject({
      name: "250ml",
      sku: "COKE-250",
      selling_price: 25,
      is_default: true,
    });
    // Each priced on its OWN figure. Only the first used to be priced at all.
    expect(posted.variants[1]).toMatchObject({
      name: "500ml",
      sku: "COKE-500",
      selling_price: 45,
      is_default: false,
    });
    // Its own code too: two sizes are two things on a shelf.
    expect(posted.variants[0].barcode).toBe("8901234500250");
    expect(posted.variants[1].barcode).toBe("8901234500500");

    // NOTHING product-level that a variant owns. `price`, `sku` and `barcode`
    // each land on the default variant, so sending them alongside the rows is
    // a second, quieter way to set what the rows already say.
    expect(posted.price).toBeUndefined();
    expect(posted.sku).toBeUndefined();
    expect(posted.barcode).toBeUndefined();
  });

  test("a plain product still posts the single-variant shape it always did", async ({ page }) => {
    let posted: any = null;
    await stubApi(page);
    await stubForm(page, (b) => (posted = b));

    await page.goto("/inventory/add");
    await fillBasics(page);
    await page.locator("#p-selling").fill("120");

    await page.getByRole("button", { name: "Save Product" }).click();

    await expect.poll(() => posted, { timeout: 15_000 }).not.toBeNull();
    expect(posted.type).toBeUndefined();
    expect(posted.variants).toHaveLength(1);
    expect(posted.variants[0].name).toBe("Default");
  });

  test("two sizes with the same name are refused before anything is posted", async ({ page }) => {
    let posted: any = null;
    await stubApi(page);
    await stubForm(page, (b) => (posted = b));

    await page.goto("/inventory/add");
    await fillBasics(page);
    await page.getByRole("button", { name: "Sold in several sizes?" }).click();
    await page.getByLabel("Variant 1 name").fill("500ml");
    await page.getByLabel("Variant 1 selling price").fill("45");
    await page.getByLabel("Variant 2 name").fill("500ml");
    await page.getByLabel("Variant 2 selling price").fill("45");

    await page.getByRole("button", { name: "Save Product" }).click();

    await expect(page.getByText(/both called "500ml"/)).toBeVisible({ timeout: 10_000 });
    expect(posted).toBeNull();
  });

  test("what was already typed moves into the first row rather than being lost", async ({
    page,
  }) => {
    let posted: any = null;
    await stubApi(page);
    await stubForm(page, (b) => (posted = b));

    await page.goto("/inventory/add");
    await fillBasics(page);
    // Filled in BEFORE realising the product comes in two sizes, which is the
    // order it actually happens in.
    await page.locator("#p-sku").fill("COKE-250");
    await page.locator("#p-selling").fill("25");
    await page.locator("#p-purchase").fill("18");

    await page.getByRole("button", { name: "Sold in several sizes?" }).click();

    // Carried across, not thrown away with the boxes that held it.
    await expect(page.getByLabel("Variant 1 SKU")).toHaveValue("COKE-250");
    await expect(page.getByLabel("Variant 1 selling price")).toHaveValue("25");
    await expect(page.getByLabel("Variant 1 purchase price")).toHaveValue("18");

    await page.getByLabel("Variant 1 name").fill("250ml");
    await page.getByLabel("Variant 2 name").fill("500ml");
    await page.getByLabel("Variant 2 selling price").fill("45");
    await page.getByRole("button", { name: "Save Product" }).click();

    await expect.poll(() => posted, { timeout: 15_000 }).not.toBeNull();
    expect(posted.variants[0]).toMatchObject({ name: "250ml", sku: "COKE-250", selling_price: 25 });
  });
});
