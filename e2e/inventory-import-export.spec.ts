import { test, expect, type Page } from "@playwright/test";
import { stubApi } from "./stubApi";

/** The envelope the stub answers in, so overrides look like the real thing. */
function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

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
    // Export asks what to write now, so the download is behind one confirm.
    // The default is the full catalogue, which is what this used to get.
    await page.getByRole("button", { name: /^export/i }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("dialog").getByRole("button", { name: "Export CSV" }).click();
    const file = await download;
    // The name comes from Content-Disposition, not from a guess in the client.
    expect(file.suggestedFilename()).toBe("products.csv");
  });

  test("Export sends the search that is on screen", async ({ page }) => {
    // A button that exports the whole catalogue while the screen shows a
    // search is a button that lies.
    await page.getByRole("textbox", { name: /search/i }).first().fill("rice");
    await page.evaluate(() => new Promise((r) => setTimeout(r, 700)));

    await page.getByRole("button", { name: /^export/i }).click();
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/products/export")),
      page.getByRole("dialog").getByRole("button", { name: "Export CSV" }).click(),
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


/**********************************************************************
 * Export scope, the drop zone, and the bar over both.
 */

const FULL_HEADER =
  "name,category,brand,unit,tax,type,sku,barcode,description,price,cost_price,reorder_level,track_inventory,has_expiry";
const SIMPLE_HEADER = "name,category,unit,sku,price";

/**
 * Answer the export and import endpoints, and record how they were called.
 *
 * `slow` holds the import open so the progress dialog can be observed — the
 * real one takes seconds and a test that races it would assert on a dialog
 * that had already closed.
 */
async function withCatalogFiles(page: Page, { slow = false }: { slow?: boolean } = {}) {
  const exportCalls: string[] = [];
  const importCalls: { dryRun: boolean }[] = [];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");

    if (path.startsWith("/products/export")) {
      const scope = url.searchParams.get("scope") || "";
      exportCalls.push(scope);
      const header = scope === "simple" ? SIMPLE_HEADER : FULL_HEADER;
      const row =
        scope === "simple"
          ? "Rice 5kg,Grains,Piece,R5,850.0000"
          : "Rice 5kg,Grains,ACI,Piece,VAT,SIMPLE,R5,,,850.0000,620.0000,10,true,false";
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "Content-Disposition",
          "content-disposition": `attachment; filename="${
            scope === "simple" ? "products-simple.csv" : "products.csv"
          }"`,
        },
        body: `${header}\n${row}\n`,
      });
      return;
    }

    if (path.startsWith("/products/import")) {
      const dry = /dry_run"?\r?\n?\s*true/i.test(request.postData() || "");
      importCalls.push({ dryRun: dry });
      if (slow) await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill(
        ok({
          dry_run: dry,
          total: 2,
          valid: 2,
          created: dry ? 0 : 2,
          failed: 0,
          rows: [],
        })
      );
      return;
    }

    await route.fallback();
  });

  return { exportCalls, importCalls };
}

test.describe("the export asks what to write", () => {
  test("the button opens a dialog instead of downloading one fixed file", async ({ page }) => {
    await stubApi(page);
    const { exportCalls } = await withCatalogFiles(page);
    await page.goto("/inventory");

    await page.getByRole("button", { name: "Export" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Export products")).toBeVisible();
    await expect(dialog.getByText("Everything")).toBeVisible();
    await expect(dialog.getByText("Just the products")).toBeVisible();
    // Nothing is written until a choice is confirmed.
    expect(exportCalls).toEqual([]);
  });

  test("Everything is the default and asks for the full scope", async ({ page }) => {
    await stubApi(page);
    const { exportCalls } = await withCatalogFiles(page);
    await page.goto("/inventory");

    await page.getByRole("button", { name: "Export" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Export CSV" }).click();

    await expect.poll(() => exportCalls).toEqual(["full"]);
  });

  test("choosing the short list asks for the simple scope", async ({ page }) => {
    await stubApi(page);
    const { exportCalls } = await withCatalogFiles(page);
    await page.goto("/inventory");

    await page.getByRole("button", { name: "Export" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Just the products/ }).click();
    await dialog.getByRole("button", { name: "Export CSV" }).click();

    await expect.poll(() => exportCalls).toEqual(["simple"]);
  });

  test("both files carry every column the importer requires", async ({ page }) => {
    /**
     * The whole constraint on the short export, checked against the columns
     * the server actually writes rather than against a list copied here.
     */
    await stubApi(page);
    await withCatalogFiles(page);
    await page.goto("/inventory");

    for (const scope of ["", "?scope=simple"] as const) {
      const csv = await page.evaluate(async (s) => {
        const res = await fetch(`/api/v1/products/export/${s}`);
        return res.text();
      }, scope);
      const header = csv.split("\n")[0].split(",");
      for (const required of ["name", "category", "unit"]) {
        expect(header).toContain(required);
      }
    }
  });
});

test.describe("the import takes a file like a file", () => {
  test("there is a drop zone, not a bare browser file chip", async ({ page }) => {
    await stubApi(page);
    await withCatalogFiles(page);
    await page.goto("/inventory");

    await page.getByRole("button", { name: "Import" }).click();
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByText("Drag a CSV here")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Choose a file" })).toBeVisible();
    // The input is still there for the picker and for assistive tech; it is
    // just not what anybody looks at.
    await expect(dialog.locator('input[type="file"]')).toHaveClass(/sr-only/);
  });

  test("a chosen file is shown by name and size, and can be removed", async ({ page }) => {
    await stubApi(page);
    await withCatalogFiles(page);
    await page.goto("/inventory");

    await page.getByRole("button", { name: "Import" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "catalogue.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`${SIMPLE_HEADER}\nRice 5kg,Grains,Piece,R5,850\n`),
    });

    await expect(dialog.getByText("catalogue.csv")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Remove" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Check the file" })).toBeEnabled();

    await dialog.getByRole("button", { name: "Remove" }).click();
    await expect(dialog.getByText("Drag a CSV here")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Check the file" })).toBeDisabled();
  });

  test("anything that is not a CSV is refused before it costs a request", async ({ page }) => {
    await stubApi(page);
    const { importCalls } = await withCatalogFiles(page);
    await page.goto("/inventory");

    await page.getByRole("button", { name: "Import" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });

    await expect(dialog.getByText(/not a CSV/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Check the file" })).toBeDisabled();
    expect(importCalls).toEqual([]);
  });

  test("checking comes before writing, and the file is imported properly", async ({ page }) => {
    await stubApi(page);
    const { importCalls } = await withCatalogFiles(page);
    await page.goto("/inventory");

    await page.getByRole("button", { name: "Import" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "catalogue.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`${SIMPLE_HEADER}\nRice 5kg,Grains,Piece,R5,850\nDal 1kg,Grains,Piece,D1,120\n`),
    });

    // Step one is a DRY RUN. The first press writing to the database is the
    // one thing this dialog exists to prevent.
    await dialog.getByRole("button", { name: "Check the file" }).click();
    await expect(dialog.getByText("2 ready")).toBeVisible();
    expect(importCalls).toEqual([{ dryRun: true }]);

    await dialog.getByRole("button", { name: /Import 2 products/ }).click();
    await expect.poll(() => importCalls).toEqual([{ dryRun: true }, { dryRun: false }]);
    await expect(dialog.getByText("2 imported")).toBeVisible();
  });
});

test.describe("the progress bar", () => {
  test("a running import shows one, and it cannot be clicked away", async ({ page }) => {
    await stubApi(page);
    await withCatalogFiles(page, { slow: true });
    await page.goto("/inventory");

    await page.getByRole("button", { name: "Import" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "catalogue.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`${SIMPLE_HEADER}\nRice 5kg,Grains,Piece,R5,850\n`),
    });
    await dialog.getByRole("button", { name: "Check the file" }).click();

    const bar = page.getByRole("progressbar");
    await expect(bar).toBeVisible();
    await expect(page.getByText("Reading the file…")).toBeVisible();
    await expect(page.getByText(/keep this window open/i)).toBeVisible();

    // Escape must not take it away mid-run.
    await page.keyboard.press("Escape");
    await expect(bar).toBeVisible();

    // And it goes when the work does.
    await expect(bar).toBeHidden({ timeout: 15000 });
  });
});
