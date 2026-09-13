import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Importing a supplier's invoice as a spreadsheet.
 *
 * TWO screens, ONE format. The Purchases list builds a purchase around the
 * file; the Add Purchase screen puts the items in the table it already has and
 * lets the buyer press its own Save. Neither creates anything the other does
 * not, because both post the same file to the same endpoint and then use the
 * purchase path that was already there.
 *
 * What these hold down is the part a shopkeeper meets: a file that is wrong is
 * REFUSED with words they can act on, a file that is right says what it will
 * add before it adds it, and the template is there for anybody who would
 * rather not guess.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

/** What the server answers for a file it could read. */
const REPORT = {
  commit: false,
  total: 2,
  valid: 2,
  failed: 0,
  new_products: 1,
  new_variants: 0,
  rows: [
    {
      line: 2,
      status: "ok",
      product: "Coca-Cola",
      variant: "500ml",
      quantity: "24.000",
      unit_cost: "45.0000",
      new_product: true,
      new_variant: false,
      code: null,
      message: null,
      errors: {},
    },
    {
      line: 3,
      status: "ok",
      product: "Basmati Rice 5kg",
      variant: "Default",
      quantity: "10.000",
      unit_cost: "620.0000",
      new_product: false,
      new_variant: false,
      code: null,
      message: null,
      errors: {},
    },
  ],
  lines: [],
};

const COMMITTED = {
  ...REPORT,
  commit: true,
  lines: [
    {
      variant: "v-coke-500",
      product_name: "Coca-Cola",
      variant_name: "500ml",
      sku: "CK-500",
      quantity: "24.000",
      unit_cost: "45.0000",
      discount_amount: "0.0000",
      tax_rate: "0.0000",
      expiry_date: null,
      batch_no: "",
      new_product: true,
      new_variant: false,
    },
    {
      variant: "v-rice",
      product_name: "Basmati Rice 5kg",
      variant_name: "Default",
      sku: "RICE-5",
      quantity: "10.000",
      unit_cost: "620.0000",
      discount_amount: "0.0000",
      tax_rate: "0.0000",
      expiry_date: null,
      batch_no: "",
      new_product: false,
      new_variant: false,
    },
  ],
};

/** A file with two rows the server cannot read. */
const BROKEN_REPORT = {
  commit: false,
  total: 3,
  valid: 1,
  failed: 2,
  new_products: 0,
  new_variants: 0,
  rows: [
    { ...REPORT.rows[0], new_product: false },
    {
      line: 3,
      status: "error",
      product: "",
      variant: "",
      quantity: "2",
      unit_cost: "45",
      code: "MISSING_VALUE",
      message: "Product Name is missing.",
      errors: {},
    },
    {
      line: 4,
      status: "error",
      product: "Sprite",
      variant: "",
      quantity: "abc",
      unit_cost: "60",
      code: "INVALID_NUMBER",
      message: "Quantity must be a number. This row says 'abc'.",
      errors: {},
    },
  ],
  lines: [],
};

type Calls = { imports: string[]; purchases: string[]; template: number };

/** Answer the import endpoints, and record what was asked of them. */
async function withImport(page: Page, report: unknown = REPORT, fileError?: unknown) {
  const calls: Calls = { imports: [], purchases: [], template: 0 };

  await page.route(/\/purchases\/import-template\/$/, async (route) => {
    calls.template += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/csv",
      headers: { "Content-Disposition": 'attachment; filename="purchase-import-template.csv"' },
      body: "product,variant,quantity,unit_cost\nCoca-Cola,500ml,24,45\n",
    });
  });

  await page.route(/\/purchases\/import\/$/, async (route) => {
    const body = route.request().postData() || "";
    const commit = /name="commit"\r?\n\r?\ntrue/.test(body);
    calls.imports.push(commit ? "commit" : "check");
    if (fileError) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify(fileError),
      });
      return;
    }
    await route.fulfill(ok(commit ? COMMITTED : report));
  });

  await page.route(/\/api\/v1\/purchases\/?(\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      calls.purchases.push(route.request().postData() || "");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: "pur-new",
            reference_no: "PO-9001",
            supplier: "s-1",
            supplier_name: "Pran Distribution",
            purchase_date: "2026-04-11",
            status: "DRAFT",
            grand_total: "7280.0000",
            paid_amount: "0.0000",
            due_amount: "7280.0000",
            items: [],
          },
        }),
      });
      return;
    }
    await route.fulfill(ok([], { total: 0 }));
  });

  await page.route(/\/api\/v1\/suppliers/, (r) =>
    r.fulfill(ok([{ id: "s-1", name: "Pran Distribution", code: "SUP-1" }], { total: 1 }))
  );
  await page.route(/\/api\/v1\/warehouses/, (r) =>
    r.fulfill(
      ok(
        [
          {
            id: "w-1",
            code: "DHK-MAIN",
            name: "Dhaka Main",
            type: "MAIN",
            branch: "b-1",
            branch_name: "Dhaka — Head Office",
            is_active: true,
          },
        ],
        { total: 1 }
      )
    )
  );

  return calls;
}

/** Hand the file input a CSV without touching the disk. */
async function upload(page: Page, text = "product,variant,quantity,unit_cost\nCoca-Cola,500ml,24,45\n") {
  await page.setInputFiles('input[type="file"]', {
    name: "invoice.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text),
  });
}

test.describe("importing from the Purchases list", () => {
  test("the Import button opens a dialog that explains the format", async ({ page }) => {
    await stubApi(page);
    await withImport(page);
    await page.goto("/purchases");

    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Import Purchases")).toBeVisible();

    // The format, on demand — folded away, because a shopkeeper with a working
    // file does not need to read it.
    await page.getByRole("button", { name: /What should the file look like/i }).click();
    await expect(page.getByText("unit_cost").first()).toBeVisible();
    await expect(page.getByText(/Coca-Cola,500ml,24,45/)).toBeVisible();
  });

  test("the template can be downloaded", async ({ page }) => {
    await stubApi(page);
    const calls = await withImport(page);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Import", exact: true }).click();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download CSV template/i }).click();
    expect((await download).suggestedFilename()).toBe("purchase-import-template.csv");
    expect(calls.template).toBe(1);
  });

  test("a file is CHECKED before anything is created", async ({ page }) => {
    await stubApi(page);
    const calls = await withImport(page);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await upload(page);

    // The report, before any commit: what is in the file and what it will add.
    await expect(page.getByText("2 rows read")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("2 ready")).toBeVisible();
    await expect(page.getByText(/not in your shop yet and will be added/)).toBeVisible();
    // One request, and it was the check.
    expect(calls.imports).toEqual(["check"]);
  });

  test("a file that cannot be read says so in plain words", async ({ page }) => {
    await stubApi(page);
    await withImport(page, REPORT, {
      success: false,
      code: "MISSING_COLUMN",
      message:
        "This CSV file is not in the correct format. It is missing these columns: quantity, unit_cost.",
      errors: { columns: ["quantity", "unit_cost"] },
    });
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await upload(page, "product,variant\nCoca-Cola,500ml\n");

    await expect(page.getByText("This CSV file is not in the correct format.")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/missing these columns: quantity, unit_cost/)).toBeVisible();
    // And it says what to do next, rather than leaving somebody at a red box.
    await expect(page.getByText(/Download the template above/)).toBeVisible();
  });

  test("bad rows are listed one by one, with their row numbers", async ({ page }) => {
    await stubApi(page);
    await withImport(page, BROKEN_REPORT);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await upload(page);

    await expect(page.getByText("2 need fixing")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Row 3: Product Name is missing.")).toBeVisible();
    await expect(page.getByText(/Row 4: Quantity must be a number/)).toBeVisible();
    // The good row can still go in — a file is not all-or-nothing.
    await expect(page.getByText(/import the rows that are fine/)).toBeVisible();
  });

  test("importing saves a draft purchase through the ordinary endpoint", async ({ page }) => {
    await stubApi(page);
    const calls = await withImport(page);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Import", exact: true }).click();

    // The header the file does not carry.
    await page.getByLabel("Supplier", { exact: true }).selectOption("s-1");
    await page.getByLabel("Purchase date").fill("2026-04-11");
    await upload(page);
    await expect(page.getByText("2 ready")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /Import and save as draft/i }).click();

    await expect(page.getByText(/PO-9001 saved as a draft/)).toBeVisible({ timeout: 10_000 });
    // A DRAFT, and the dialog says what that means — nothing ordered, no stock
    // moved — because "imported" reads like "done" and it is not.
    await expect(page.getByText(/no stock has moved yet/)).toBeVisible();

    // Checked first, committed second. And the purchase went through the SAME
    // POST /purchases/ a hand-typed order uses, carrying the resolved lines.
    expect(calls.imports).toEqual(["check", "commit"]);
    expect(calls.purchases).toHaveLength(1);
    expect(calls.purchases[0]).toContain('"variant":"v-coke-500"');
    expect(calls.purchases[0]).toContain('"supplier":"s-1"');
  });

  test("it will not import until the supplier and date are chosen", async ({ page }) => {
    await stubApi(page);
    await withImport(page);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await upload(page);
    await expect(page.getByText("2 ready")).toBeVisible({ timeout: 10_000 });

    // The file is fine; the order has nobody to be from.
    await expect(page.getByText(/Choose a supplier, a warehouse and a date/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Import and save as draft/i })).toBeDisabled();
  });
});

test.describe("bulk import on the Add Purchase screen", () => {
  test("Manual is the default and still works", async ({ page }) => {
    await stubApi(page);
    await withImport(page);
    await page.goto("/purchases/add");

    const manual = page.getByRole("tab", { name: "Manual" });
    await expect(manual).toHaveAttribute("aria-selected", "true");
    // The picker the screen has always had.
    await expect(page.getByPlaceholder(/Search/).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "Bulk Import" })).toBeVisible();
  });

  test("Bulk Import puts the items in the table the buyer already uses", async ({ page }) => {
    await stubApi(page);
    const calls = await withImport(page);
    await page.goto("/purchases/add");

    await page.getByRole("tab", { name: "Bulk Import" }).click();
    await upload(page);
    await expect(page.getByText("2 ready")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Add to this order/i }).click();

    // Back on the table, with the rows in it — and NOT saved: the buyer
    // presses the screen's own Save, exactly as for a typed order.
    await expect(page.getByText(/2 items added to this order/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Coca-Cola").first()).toBeVisible();
    await expect(page.getByText("Basmati Rice 5kg").first()).toBeVisible();
    expect(calls.purchases).toHaveLength(0);
  });

  test("imported items are editable like any other line", async ({ page }) => {
    await stubApi(page);
    await withImport(page);
    await page.goto("/purchases/add");

    await page.getByRole("tab", { name: "Bulk Import" }).click();
    await upload(page);
    await expect(page.getByText("2 ready")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Add to this order/i }).click();
    await expect(page.getByText(/2 items added to this order/)).toBeVisible({ timeout: 10_000 });

    // The same controls a manually added line gets. An imported row that could
    // not be corrected would send the buyer back to the spreadsheet.
    await expect(page.getByRole("button", { name: /Remove/i }).first()).toBeVisible();
  });
});
