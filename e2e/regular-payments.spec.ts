import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Regular payments — the money a shop knows is coming.
 *
 * What is worth driving is the reason the screen exists: a shop does not
 * forget that it pays rent, it forgets that the rent is due TODAY. So:
 *
 *   * what is late comes first, and says how late in words rather than dates;
 *   * paying one writes a voucher and hands the slip straight back;
 *   * and a paused schedule is not offered a Pay now that the API would refuse.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

const SCHEDULES = [
  {
    id: "s-1",
    name: "Shop rent",
    kind: "EXPENSE",
    category_id: "ec-1",
    category_name: "Rent",
    amount: "60000.0000",
    frequency: "MONTHLY",
    start_date: "2026-03-01",
    next_due_date: "2026-04-01",
    end_date: null,
    last_paid_on: "2026-03-01",
    state: "OVERDUE",
    days_until_due: -3,
    is_active: true,
    notes: "",
    branch_id: "b-1",
    branch_name: "Dhaka — Head Office",
    payment_account_id: null,
    payment_account_name: "Cash",
    monthly_equivalent: "60000.0000",
    paid_count: 1,
  },
  {
    id: "s-2",
    name: "Internet",
    kind: "EXPENSE",
    category_id: "ec-2",
    category_name: "Utilities",
    amount: "3200.0000",
    frequency: "MONTHLY",
    start_date: "2026-03-15",
    next_due_date: "2026-04-15",
    end_date: null,
    last_paid_on: null,
    state: "UPCOMING",
    days_until_due: 11,
    is_active: true,
    notes: "",
    branch_id: "b-1",
    branch_name: "Dhaka — Head Office",
    payment_account_id: null,
    payment_account_name: "Cash",
    monthly_equivalent: "3200.0000",
    paid_count: 0,
  },
  {
    id: "s-3",
    name: "Storage unit",
    kind: "EXPENSE",
    category_id: "ec-1",
    category_name: "Rent",
    amount: "5000.0000",
    frequency: "MONTHLY",
    start_date: "2026-01-01",
    next_due_date: "2026-04-01",
    end_date: null,
    last_paid_on: null,
    state: "PAUSED",
    days_until_due: -3,
    is_active: false,
    notes: "Suspended until the shop reopens",
    branch_id: "b-1",
    branch_name: "Dhaka — Head Office",
    payment_account_id: null,
    payment_account_name: "Cash",
    monthly_equivalent: "5000.0000",
    paid_count: 0,
  },
];

const SUMMARY = {
  active: 2,
  due_soon: 1,
  overdue: 1,
  monthly_out: "63200.0000",
  monthly_in: "0.0000",
};

const VOUCHER = {
  id: "v-new",
  type: "EXPENSE",
  voucher_no: "DHK-VCH-26-000007",
  date: "2026-04-04",
  category_id: "ec-1",
  category_name: "Rent",
  description: "Shop rent",
  amount: "60000.0000",
  signed_amount: "-60000.0000",
  branch_id: "b-1",
  branch_name: "Dhaka — Head Office",
  payment_account_id: null,
  payment_account_name: "Cash",
  created_at: "2026-04-04T09:00:00Z",
};

async function withSchedules(page: Page) {
  const calls: { list: string[]; writes: string[] } = { list: [], writes: [] };

  await page.route(/\/api\/v1\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");

    if (path.startsWith("/regular-payments/summary")) {
      await route.fulfill(ok(SUMMARY));
      return;
    }
    if (path.includes("/pay")) {
      calls.writes.push(`PAY ${path} ${request.postData() || ""}`);
      await route.fulfill(ok(VOUCHER));
      return;
    }
    if (path.startsWith("/regular-payments") && request.method() === "POST") {
      calls.writes.push(`POST ${path} ${request.postData() || ""}`);
      await route.fulfill(ok({ ...SCHEDULES[1], id: "s-new", name: "Cleaner" }));
      return;
    }
    if (path.startsWith("/regular-payments") && request.method() === "PATCH") {
      calls.writes.push(`PATCH ${path} ${request.postData() || ""}`);
      await route.fulfill(ok({ ...SCHEDULES[0], is_active: false, state: "PAUSED" }));
      return;
    }
    if (path.startsWith("/regular-payments") && request.method() === "GET") {
      calls.list.push(url.search);
      const state = url.searchParams.get("state");
      const rows = state ? SCHEDULES.filter((s) => s.state === state) : SCHEDULES;
      await route.fulfill(ok(rows, { total: rows.length, page: 1, limit: 25 }));
      return;
    }
    if (path.startsWith("/expense-categories")) {
      await route.fulfill(ok([{ id: "ec-1", name: "Rent" }], { total: 1 }));
      return;
    }
    if (path.startsWith("/income-categories")) {
      await route.fulfill(ok([{ id: "ic-1", name: "Sublet" }], { total: 1 }));
      return;
    }
    if (path.startsWith("/accounts")) {
      await route.fulfill(
        ok([{ id: "a-1", code: "1100", name: "Cash", account_type: "ASSET", is_active: true }], {
          total: 1,
        })
      );
      return;
    }
    await route.fallback();
  });

  return calls;
}

/**
 * Open the screen and get past the due-today prompt.
 *
 * Two of these schedules are OVERDUE, so the confirmation opens over the page
 * the moment it loads — which is the feature, not a nuisance: money is never
 * deducted because a date arrived, only because somebody answered. Closing it
 * leaves the instalment unresolved, exactly as walking away would, so the
 * tests below drive the page underneath in its ordinary state.
 *
 * The prompt's own behaviour is driven in "the due-today prompt" below.
 */
async function openList(page: Page) {
  await page.goto("/finance/regular-payments");
  // WAIT for it rather than testing `isVisible` straight after the navigation:
  // the prompt is driven by its own request, so it is reliably absent for a
  // moment and then reliably there. Checking too early skipped the dismissal
  // and every later click landed on the backdrop.
  const prompt = page.getByRole("dialog", { name: /payment due/i });
  await prompt.waitFor({ state: "visible", timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(prompt).toBeHidden();
}

test.describe("the schedule list", () => {
  test("it says how late a payment is, in words", async ({ page }) => {
    await stubApi(page);
    await withSchedules(page);
    await openList(page);

    await expect(page.getByText("Shop rent").first()).toBeVisible();
    // A date alone makes the reader do the arithmetic, and the whole reason
    // this screen exists is that nobody does it.
    await expect(page.getByText("3 days late").first()).toBeVisible();
    await expect(page.getByText("in 11 days").first()).toBeVisible();
    await expect(page.getByText("Overdue").first()).toBeVisible();
  });

  test("the cards name the commitment, not a net", async ({ page }) => {
    await stubApi(page);
    await withSchedules(page);
    await openList(page);

    await expect(page.getByText("Active schedules")).toBeVisible();
    await expect(page.getByText("Monthly commitment")).toBeVisible();
    await expect(page.getByText("৳ 63,200")).toBeVisible();
    await expect(page.getByText("Needs paying")).toBeVisible();
  });

  test("the state filter asks the server for that state", async ({ page }) => {
    await stubApi(page);
    const calls = await withSchedules(page);
    await openList(page);
    await expect(page.getByText("Internet").first()).toBeVisible();

    await page.getByRole("button", { name: "All states" }).click();
    await page.getByRole("option", { name: "Overdue" }).click();

    await expect(page.getByText("Internet")).toHaveCount(0);
    expect(calls.list.some((q) => q.includes("state=OVERDUE"))).toBe(true);
  });
});

test.describe("paying one", () => {
  test("it writes a voucher and shows the slip", async ({ page }) => {
    await stubApi(page);
    const calls = await withSchedules(page);
    await openList(page);

    await page.getByRole("button", { name: "Actions for Shop rent" }).first().click();
    await page.getByRole("menuitem", { name: "Pay now" }).click();

    // Everything is already known, so this is a confirm and not a form.
    await expect(page.getByText(/due 01-04-2026/i)).toBeVisible();
    await page.getByRole("button", { name: /pay & print/i }).click();

    await expect(page.getByText("PAYMENT VOUCHER")).toBeVisible();
    // Scoped to the slip: the toast under the table names the number too.
    await expect(page.getByText("Voucher No: DHK-VCH-26-000007")).toBeVisible();
    expect(calls.writes.some((w) => w.startsWith("PAY /regular-payments/s-1/pay/"))).toBe(true);
  });

  test("an empty amount box pays the schedule's own figure", async ({ page }) => {
    await stubApi(page);
    const calls = await withSchedules(page);
    await openList(page);

    await page.getByRole("button", { name: "Actions for Shop rent" }).first().click();
    await page.getByRole("menuitem", { name: "Pay now" }).click();
    await page.getByRole("button", { name: /pay & print/i }).click();

    // No `amount` on the wire at all. Sending it anyway would turn every
    // payment into an override and lose the distinction.
    const paid = calls.writes.find((w) => w.startsWith("PAY "));
    expect(paid).toBeTruthy();
    expect(paid).not.toContain('"amount"');
  });

  test("a different figure is sent for this instalment only", async ({ page }) => {
    await stubApi(page);
    const calls = await withSchedules(page);
    await openList(page);

    await page.getByRole("button", { name: "Actions for Shop rent" }).first().click();
    await page.getByRole("menuitem", { name: "Pay now" }).click();
    await page.getByLabel("Amount to pay").fill("61500");
    await page.getByRole("button", { name: /pay & print/i }).click();

    const paid = calls.writes.find((w) => w.startsWith("PAY "));
    expect(paid).toContain('"amount":"61500.0000"');
  });

  test("a paused schedule is not offered a payment", async ({ page }) => {
    await stubApi(page);
    await withSchedules(page);
    await openList(page);

    await page.getByRole("button", { name: "Actions for Storage unit" }).first().click();
    // The API refuses it with SCHEDULE_PAUSED, and a menu that offers what the
    // API refuses is how somebody concludes the product is broken.
    await expect(page.getByRole("menuitem", { name: "Pay now" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Resume" })).toBeVisible();
  });
});

test.describe("amending one", () => {
  test("editing warns that paid vouchers are untouched", async ({ page }) => {
    await stubApi(page);
    await withSchedules(page);
    await openList(page);

    await page.getByRole("button", { name: "Actions for Shop rent" }).first().click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The rent going up is next month's figure, not a correction to last
    // month's payment.
    await expect(dialog.getByText(/affects the next one only/i)).toBeVisible();
  });

  test("removing says the payments already made stay", async ({ page }) => {
    await stubApi(page);
    await withSchedules(page);
    await openList(page);

    await page.getByRole("button", { name: "Actions for Shop rent" }).first().click();
    await page.getByRole("menuitem", { name: "Remove" }).click();

    await expect(page.getByText(/does not un-pay them/i)).toBeVisible();
    await expect(page.getByText(/use Pause/i)).toBeVisible();
  });
});

/**
 * The due-today prompt.
 *
 * A date arriving is not a payment. The screen ASKS, and money moves only on
 * "Yes, paid" — which is the whole point: an unattended deduction on the day a
 * bill falls due takes money out of a shop's account for a bill that may not
 * have been settled, and leaves nobody able to tell the two cases apart.
 *
 * "No, not paid" is not silence either. It records the occurrence, so a missed
 * month is on the record rather than simply absent.
 */
test.describe("the due-today prompt", () => {
  const promptOf = (page: Page) => page.getByRole("dialog", { name: /payment due/i });

  test("it asks about a payment that has fallen due", async ({ page }) => {
    await stubApi(page);
    await withSchedules(page);
    await page.goto("/finance/regular-payments");

    const prompt = promptOf(page);
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await expect(prompt.getByText(/Did you pay this bill\?/)).toBeVisible();
    // The figures a shopkeeper needs to answer it, and the account it comes
    // out of — not just a name and a date.
    await expect(prompt.getByText("Shop rent").first()).toBeVisible();
    await expect(prompt.getByText("৳ 60,000").first()).toBeVisible();
    await expect(prompt.getByText("Paid from")).toBeVisible();
    await expect(prompt.getByText("Cash").first()).toBeVisible();
  });

  test("it offers both answers and nothing else", async ({ page }) => {
    await stubApi(page);
    await withSchedules(page);
    await page.goto("/finance/regular-payments");

    const prompt = promptOf(page);
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await expect(prompt.getByRole("button", { name: "Yes, paid" })).toBeVisible();
    await expect(prompt.getByRole("button", { name: "No, not paid" })).toBeVisible();
  });

  test("nothing at all is sent until an answer is given", async ({ page }) => {
    // THE RULE. Opening the screen must not move money.
    await stubApi(page);
    const calls = await withSchedules(page);
    await page.goto("/finance/regular-payments");
    await expect(promptOf(page)).toBeVisible({ timeout: 15_000 });

    expect(calls.writes).toEqual([]);
  });

  test("Yes, paid pays it through the ordinary voucher path", async ({ page }) => {
    await stubApi(page);
    const calls = await withSchedules(page);
    await page.goto("/finance/regular-payments");

    const prompt = promptOf(page);
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await prompt.getByRole("button", { name: "Yes, paid" }).click();

    await expect.poll(() => calls.writes.length).toBeGreaterThan(0);
    expect(calls.writes[0]).toContain("PAY /regular-payments/s-1/pay/");
    // The schedule's own figure. The prompt is a confirmation, not a form, so
    // it never names an amount of its own.
    expect(calls.writes[0]).not.toContain("amount");
  });

  test("No, not paid records the miss and sends no payment", async ({ page }) => {
    await stubApi(page);
    const calls = await withSchedules(page);
    await page.goto("/finance/regular-payments");

    const prompt = promptOf(page);
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await prompt.getByRole("button", { name: "No, not paid" }).click();

    await expect.poll(() => calls.writes.length).toBeGreaterThan(0);
    // The skip endpoint, which writes a NOT_PAID occurrence and no voucher.
    expect(calls.writes[0]).toContain("/skip/");
    // And emphatically not the pay one.
    expect(calls.writes.some((w) => w.includes("/pay/"))).toBe(false);
  });

  test("closing it answers nothing", async ({ page }) => {
    // An unanswered bill stays unanswered. Dismissing is not declining, and it
    // must not be recorded as one.
    await stubApi(page);
    const calls = await withSchedules(page);
    await page.goto("/finance/regular-payments");

    const prompt = promptOf(page);
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(prompt).toBeHidden();

    expect(calls.writes).toEqual([]);
  });
});
