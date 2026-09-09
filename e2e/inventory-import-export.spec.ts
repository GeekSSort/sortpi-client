import { test, expect } from "@playwright/test";
import { stubApi } from "./stubApi";

/**
 * Import and Export on the products screen.
 *
 * Both are real round trips, so both are driven rather than inspected: an
 * Export button that renders and downloads nothing, and an Import button that
 * opens a dialog and never posts the file, would both look identical to a
 * screenshot test.
 */
test.describe("products import and export", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.goto("/inventory");
    await page.waitForLoadState("load");
    await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));
  });

  test("both buttons sit before Add New", async ({ page }) => {
    const importBtn = page.getByRole("button", { name: /^import$/i });
    const exportBtn = page.getByRole("button", { name: /^export/i });
    const addNew = page.getByRole("link", { name: /add new/i });
    await expect(importBtn).toBeVisible();
    await expect(exportBtn).toBeVisible();

    const [i, e, a] = await Promise.all([
      importBtn.boundingBox(),
      exportBtn.boundingBox(),
      addNew.boundingBox(),
    ]);
    expect(i!.x, "Import should come before Export").toBeLessThan(e!.x);
    expect(e!.x, "Export should come before Add New").toBeLessThan(a!.x);
  });

  test("Export downloads a CSV named by the server", async ({ page }) => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /^export/i }).click();
    const file = await download;
    // The name comes from Content-Disposition, not from a guess in the client.
    expect(file.suggestedFilename()).toBe("products.csv");
  });

  test("Export sends the search that is on screen", async ({ page }) => {
    // A button that exports the whole catalogue while the screen shows a
    // search is a button that lies.
    await page.getByRole("textbox", { name: /search/i }).first().fill("rice");
    await page.evaluate(() => new Promise((r) => setTimeout(r, 700)));

    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/products/export")),
      page.getByRole("button", { name: /^export/i }).click(),
    ]);
    expect(new URL(request.url()).searchParams.get("search")).toBe("rice");
  });

  test("Import checks the file before it writes anything", async ({ page }) => {
    await page.getByRole("button", { name: /^import$/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByLabel(/csv file/i).setInputFiles({
      name: "products.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,category,unit\nRice 5kg,Grains,Piece\n"),
    });

    // The first press is a DRY RUN. It must report, not import.
    const [dryRun] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/products/import")),
      page.getByRole("button", { name: /check the file/i }).click(),
    ]);
    expect(dryRun.postData()).toContain("true");

    await expect(page.getByText(/3 rows read/i)).toBeVisible();
    await expect(page.getByText(/2 ready/i)).toBeVisible();
    await expect(page.getByText(/1 to fix/i)).toBeVisible();
    // The reason for the bad row is shown, not just the count — otherwise
    // there is nothing to act on.
    await expect(page.getByText(/No category named 'Dairy' exists/i)).toBeVisible();
  });

  test("only after the check does it write", async ({ page }) => {
    await page.getByRole("button", { name: /^import$/i }).click();
    await page.getByLabel(/csv file/i).setInputFiles({
      name: "products.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,category,unit\nRice 5kg,Grains,Piece\n"),
    });
    await page.getByRole("button", { name: /check the file/i }).click();
    await expect(page.getByText(/2 ready/i)).toBeVisible();

    const [real] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/products/import")),
      page.getByRole("button", { name: /import 2 products/i }).click(),
    ]);
    expect(real.postData(), "the second run must not be a dry run").toContain("false");
    await expect(page.getByText(/2 imported/i)).toBeVisible();
  });

  test("choosing another file drops the previous report", async ({ page }) => {
    // Otherwise somebody commits a run they checked against a different file.
    await page.getByRole("button", { name: /^import$/i }).click();
    const input = page.getByLabel(/csv file/i);
    await input.setInputFiles({
      name: "a.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,category,unit\nA,Grains,Piece\n"),
    });
    await page.getByRole("button", { name: /check the file/i }).click();
    await expect(page.getByText(/2 ready/i)).toBeVisible();

    await input.setInputFiles({
      name: "b.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,category,unit\nB,Grains,Piece\n"),
    });
    await expect(page.getByText(/2 ready/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /check the file/i })).toBeVisible();
  });
});

/**
 * Without `product.import`, the button is not there.
 *
 * Hiding is not the control — the API refuses the upload regardless — but a
 * button that opens a dialog, takes a file and then fails is worse than no
 * button, and it is how somebody concludes the product is broken rather than
 * that they lack a permission. Export stays: it rides `product.view`, which
 * anyone reading this page already holds.
 */
test.describe("without the import permission", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, { without: ["product.import"] });
    await page.goto("/inventory");
    await page.waitForLoadState("load");
    await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));
  });

  test("Import is hidden and Export is not", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^export/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^import$/i })).toHaveCount(0);
  });
});
