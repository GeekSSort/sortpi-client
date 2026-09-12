import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * The shop's ACTIVE stock type, and what it is allowed to do.
 *
 * It is a DEFAULT and not a restriction, and the distinction is the whole
 * design: `Product.unit` stays a required per-product field because a shop
 * genuinely sells bottles by the piece and cloth by the metre, and the unit's
 * `allowDecimal` is what lets the till take 2.5 of one and refuse 2.5 of the
 * other. What the setting removes is answering the same question on every
 * product a single-commodity shop ever adds.
 *
 * So these assert two things that pull against each other: the picker STARTS
 * on the active type, and it is still a picker.
 */

const UNITS = [
  { id: "u-pcs", name: "Piece", short_name: "pcs", allow_decimal: false },
  { id: "u-kg", name: "Kilogram", short_name: "kg", allow_decimal: true },
  { id: "u-m", name: "Metre", short_name: "m", allow_decimal: true },
];

/** Serve the catalogue lists and the resolved settings the form reads. */
async function stubCatalogue(page: Page, activeUnitId: string) {
  await page.route(/\/units/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: UNITS, total: UNITS.length }),
    });
  });
  await page.route(/\/settings\/resolved/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: activeUnitId
          ? [{ key: "inventory.default_unit_id", value: activeUnitId, value_type: "STRING" }]
          : [],
      }),
    });
  });
}

test.describe("the active stock type", () => {
  test("Add Product starts in it, and can still be changed", async ({ page }) => {
    await stubApi(page);
    await stubCatalogue(page, "u-kg");

    await page.goto("/inventory/add");

    // Started in the active type rather than on "Select unit". Asserted
    // through the accessible name, so it also covers a screen reader being
    // told which stock type is chosen.
    const picker = page.getByRole("button", { name: /Select unit/ }).first();
    await expect(picker).toHaveAccessibleName(/Kilogram/, { timeout: 15_000 });

    // Still a picker: a shop with bottles AND cloth has to be able to say
    // which this one is.
    await picker.click();
    await expect(page.getByText("Metre", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("with none set the picker opens empty, as it always did", async ({ page }) => {
    await stubApi(page);
    await stubCatalogue(page, "");

    await page.goto("/inventory/add");

    await expect(page.getByText("Select unit").first()).toBeVisible({ timeout: 15_000 });
  });

  test("an active type that has since been deleted is ignored", async ({ page }) => {
    // The setting holds an id, and a stock type can be deleted after being
    // made active. An id matching nothing in the list must read as "no
    // default" rather than as a picker showing a blank selection.
    await stubApi(page);
    await stubCatalogue(page, "u-gone");

    await page.goto("/inventory/add");

    await expect(page.getByText("Select unit").first()).toBeVisible({ timeout: 15_000 });
  });
});
