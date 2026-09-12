import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * A setting saved in one place has to reach every screen that reads it.
 *
 * `SettingsService.getValues` memoises the resolved map per branch so that ten
 * components asking at once make one request. `setValue` clears that memo —
 * which covers the tab that saved. It does NOT cover any other tab: an
 * invalidation crossing tabs is a BroadcastChannel message, not a function
 * call, so the till's copy of the module never heard about the save. Its
 * queries went stale, refetched, and the memo handed them the values from
 * before.
 *
 * The shop that hits this is the ordinary one: back office open beside the
 * till. Every POS switch was affected — manual quantity, partial payment, the
 * VAT rate, the discount ceiling — and the only cure was a hard reload, with
 * nothing on screen to suggest it.
 *
 * Driven through the real screen, because the failure is wiring. Neither the
 * store nor the service is wrong on its own.
 */

/** One resolved-settings row, in the shape `/settings/resolved/` returns. */
const row = (key: string, value: string) => ({ key, value, value_type: "BOOL" });

/**
 * Serve settings that can be changed mid-test.
 *
 * Registered AFTER `stubApi`, and Playwright runs the most recently added
 * handler first, so this wins for the one path it claims and everything else
 * falls through to the stub.
 */
async function serveSettings(
  page: Page,
  get: () => Record<string, string>,
  onFetch: () => void = () => {}
) {
  // A RegExp, not a glob: the URL ends in "resolved/" and a glob `*`
  // does not cross a slash, so `resolved*` silently matched nothing and the
  // shared stub answered with an empty settings list instead.
  await page.route(/\/settings\/resolved/, async (route) => {
    onFetch();
    const rows = Object.entries(get()).map(([k, v]) => row(k, v));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: rows }),
    });
  });
}

/**
 * Stock the shelf.
 *
 * The shared stub answers `/inventory/stock` with an empty list, so every tile
 * reads "None left" and clicking one cannot put it in the cart — there would
 * be no quantity control for this test to look at, and the failure would look
 * like the setting rather than the fixture.
 */
async function stockTheShelf(page: Page) {
  await page.route(/\/inventory\/stock/, async (route) => {
    // `available` and `sku` are the two fields `PosService.stockOnThisTill`
    // actually reads; the warehouse filter is skipped when none is resolved.
    const rows = Array.from({ length: 30 }, (_, i) => ({
      sku: `SKU-${i + 1}`,
      available: "25.000",
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: rows, total: rows.length }),
    });
  });
}

/**
 * What the OTHER tab's save looks like from in here: a cache invalidation
 * arriving over BroadcastChannel, with no local function call to go with it.
 */
async function saveElsewhere(page: Page) {
  await page.evaluate(() => {
    new BroadcastChannel("sp-cache").postMessage({ prefixes: ["settings"] });
  });
}

/** Put one product in the cart, so there is a quantity control to look at. */
async function addFirstProduct(page: Page) {
  const tile = page.getByRole("button", { name: /Product 01/ }).first();
  await tile.waitFor({ state: "visible", timeout: 15_000 });
  await tile.click();
  // The line has to actually be on the sale; a click the till refused would
  // otherwise read as the setting failing.
  await expect(page.getByRole("button", { name: "Increase quantity" }).first()).toBeVisible({
    timeout: 10_000,
  });
}

test.describe("a saved setting reaches an open till", () => {
  // Wide enough for the three-column till, so the SELECTED ITEMS column is the
  // one under test. Below xl the invoice column carries the stepper instead,
  // and the two label their box differently.
  test.use({ viewport: { width: 1600, height: 1000 } });

  /**
   * Changed TWICE, and the second change is the one that matters.
   *
   * The first change is not proof of anything. `getValues` keys its memo on
   * the branch, and the branch is not resolved on the very first read — so the
   * first invalidation happens to miss the memo and fetch for real, whatever
   * the bug. It is every change after that which was silently dropped: the
   * memo is warm, the refetch is answered from it, and the till stays on the
   * settings it already had for as long as the tab is open.
   *
   * Run against the unfixed build this passes its first assertion and fails
   * the second, which is exactly the shape of the original report — "I changed
   * it in settings and the till did not notice".
   *
   * One switch stands for all of them: the memo holds the whole resolved map,
   * so partial payment, the VAT rate, the discount ceiling and the tender list
   * were stuck in the same way and are freed by the same clear. Manual
   * quantity is the one asserted here because its effect is a single element
   * appearing and disappearing, with no dialog to open first.
   */
  test("every change reaches it, not just the first", async ({ page }) => {
    let values: Record<string, string> = { "pos.allow_manual_quantity": "false" };
    let fetches = 0;

    await stubApi(page);
    await stockTheShelf(page);
    await serveSettings(page, () => values, () => { fetches++; });

    await page.goto("/pos");
    await addFirstProduct(page);

    const qty = page.getByLabel(/^Quantity/).first();
    // Off: the quantity is a label, and only the buttons move it.
    await expect(qty).toHaveCount(0);

    // The back office saves. In this tab that arrives as a broadcast, which is
    // precisely what the second tab of a real shop receives.
    values = { "pos.allow_manual_quantity": "true" };
    await saveElsewhere(page);
    await expect(qty).toBeVisible({ timeout: 10_000 });

    // Switched off again. THIS is the assertion the bug fails.
    values = { "pos.allow_manual_quantity": "false" };
    await saveElsewhere(page);
    await expect(qty).toHaveCount(0, { timeout: 10_000 });

    // And on once more, so the pass cannot be a single sticky transition.
    values = { "pos.allow_manual_quantity": "true" };
    await saveElsewhere(page);
    await expect(qty).toBeVisible({ timeout: 10_000 });

    // Each change actually went to the server. Without the memo being cleared
    // the count sticks and the screen simply stops moving.
    expect(fetches).toBeGreaterThanOrEqual(4);
  });

});
