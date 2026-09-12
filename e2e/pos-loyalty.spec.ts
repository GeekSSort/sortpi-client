import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Customer points at the till.
 *
 * Every rule comes from Settings — the POS decides nothing — so these drive
 * the real screen with the settings served two different ways and assert that
 * the till obeys them. The scheme is the shop's own:
 *
 *     every ৳100 spent = 10 points,  100 points = ৳50 off
 *
 * Spending points is OPTIONAL and that is asserted too: the commonest sale to
 * a customer with a wallet is one where they keep it.
 *
 * WHERE the choice is made moved, and these moved with it. It used to be a
 * number typed into the payment dialog, beside a four-line statement of what
 * the customer held, spent, earned and would leave with. That answered a
 * question nobody asks while money is being counted, and the box could hold a
 * figure the rules no longer allowed once the basket changed — a sale refused
 * at the counter. It is one checkbox in the customer summary now, and the
 * dialog shows the RESULT: a single "Points discount" line above Total
 * Payable.
 */

const COKE = {
  id: "p-coke",
  name: "Coca-Cola",
  category: "c-1",
  category_name: "Beverages",
  is_active: true,
  images: [],
  variants: [
    { id: "v-1", sku: "CK-1", name: "Default", is_default: true, is_active: true, price: "1000.0000", barcodes: [] },
  ],
};

const CUSTOMERS = [
  { id: "cus-1", name: "Arif Hossain", phone: "01810000012", customer_type: "RETAIL", loyalty_points: 380 },
  { id: "cus-2", name: "New Shopper", phone: "01810000099", customer_type: "RETAIL", loyalty_points: 0 },
];

const SCHEME: Record<string, string> = {
  "loyalty.enabled": "true",
  "loyalty.earn_per_amount": "100",
  "loyalty.earn_points": "10",
  "loyalty.earn_basis": "NET_PAYABLE",
  "loyalty.redeem_mode": "FLAT",
  "loyalty.redeem_points": "100",
  "loyalty.redeem_value": "50",
  "loyalty.min_redeem_points": "100",
  "loyalty.allow_partial_redeem": "false",
  "loyalty.max_redeem_per_sale": "0",
};

async function stubTill(page: Page, settings: Record<string, string>) {
  await page.route(/\/inventory\/stock/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [{ sku: "CK-1", available: "50.000" }], total: 1 }),
    })
  );
  await page.route(/\/products\/\?|\/products\/$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [COKE], total: 1 }),
    })
  );
  await page.route(/\/customers/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: CUSTOMERS, total: CUSTOMERS.length }),
    })
  );
  await page.route(/\/settings\/resolved/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: Object.entries(settings).map(([key, value]) => ({ key, value, value_type: "STRING" })),
      }),
    })
  );
}

/** One ৳1,000 bottle in the cart. */
async function ringUp(page: Page) {
  await page.getByRole("button", { name: /Coca-Cola/ }).first().click();
  await expect(page.getByRole("button", { name: "Increase quantity" }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Put a named customer on the invoice.
 *
 * The till opens on the walk-in, deliberately: a walk-in has no wallet, so
 * points are absent until somebody is actually named. Every points test has to
 * do this first, which is itself the assertion that the default is right.
 */
async function choose(page: Page, name: string) {
  await page.getByRole("button", { name: /Walk-in Customer/ }).first().click();
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * The same till, with a server that actually books the sale.
 *
 * `stubTill` serves a fixed customer list, which is right for every test that
 * only reads it. This one moves the balance the way a real checkout does — the
 * points are spent and the sale's earnings land — so the screen can be asked
 * whether it NOTICED.
 */
async function stubTillWithCheckout(page: Page, settings: Record<string, string>) {
  const wallet = { points: 380 };

  // FIRST, so the routes below override it. Playwright matches routes in
  // reverse registration order, and `stubTill` serves a fixed customer list —
  // registered after these, it would win and the balance would never move.
  await stubTill(page, settings);

  await page.route(/\/sales\/?(\?|$)/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [], total: 0 }),
      });
      return;
    }
    // 300 spent, and ৳850 net at 10 points per ৳100 earns 80 back.
    wallet.points = 380 - 300 + 80;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "sale-1",
          invoice_number: "INV-0001",
          grand_total: "850.0000",
          paid_amount: "850.0000",
          due_amount: "0.0000",
          items: [],
          payments: [],
        },
      }),
    });
  });

  await page.route(/\/customers/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [{ ...CUSTOMERS[0], loyalty_points: wallet.points }, CUSTOMERS[1]],
        total: 2,
      }),
    })
  );
  // A place to sell FROM. Without it the till refuses at the dialog — "this
  // branch has no warehouse to sell from" — and the sale this test is about
  // never reaches the server.
  await page.route(/\/warehouses/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
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
        total: 1,
      }),
    })
  );

  // An open till. `pos.require_shift` is on by default, and a shift that never
  // opens is another way for the sale to stop before it is posted.
  await page.route(/\/pos\/shifts/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { id: "sh-1", status: "OPEN", opening_float: "0.0000" },
      }),
    })
  );


}

test.use({ viewport: { width: 1600, height: 1000 } });

/** The one control: "Use customer points", in the customer summary. */
const boxOf = (page: Page) => page.getByLabel("Use customer points");

test.describe("customer points at the till", () => {
  test("a shop with the scheme off shows nothing about points", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, { "loyalty.enabled": "false" });
    await page.goto("/pos");
    await ringUp(page);

    // Not beside the customer, and not in the payment dialog.
    await expect(page.getByText(/pts$/)).toHaveCount(0);
    await expect(boxOf(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Pay Cash" }).click();
    await expect(page.getByText("Points discount")).toHaveCount(0);
  });

  test("a walk-in is offered nothing — there is no wallet", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, SCHEME);
    await page.goto("/pos");
    await ringUp(page);

    // The till opens on the walk-in deliberately, and the option appears only
    // once somebody is actually named.
    await expect(boxOf(page)).toHaveCount(0);
  });

  test("the wallet and the option show once a customer is chosen", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, SCHEME);
    await page.goto("/pos");
    await choose(page, "Arif Hossain");
    await ringUp(page);

    await expect(page.getByText("380 pts").first()).toBeVisible({ timeout: 15_000 });
    await expect(boxOf(page)).toBeVisible();
    // Nothing is spent unless the cashier asks.
    await expect(boxOf(page)).not.toBeChecked();
    await expect(page.getByText(/Available:/)).toBeVisible();
  });

  test("ticking it states the discount in one line", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, SCHEME);
    await page.goto("/pos");
    await choose(page, "Arif Hossain");
    await ringUp(page);

    await boxOf(page).check();

    // 380 points spend in whole blocks of 100, so 300 — and 80 stay put, which
    // the line has to say or the customer asks where they went.
    await expect(page.getByText(/300 points used/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/80 points remaining/)).toBeVisible();
    // 3 blocks at ৳50 is ৳150 off a ৳1,000 bill — to the paisa, because every
    // amount at this till now carries two decimals and no more. A bare
    // `toLocaleString` used to print none on a round figure and THREE on a
    // percentage coupon, so the same column could read "100", "99.5" and
    // "33.333".
    await expect(page.getByText(/৳ ?150\.00 off/).first()).toBeVisible();
  });

  test("the payment dialog shows the result and not the arithmetic", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, SCHEME);
    await page.goto("/pos");
    await choose(page, "Arif Hossain");
    await ringUp(page);
    await boxOf(page).check();
    await page.getByRole("button", { name: "Pay Cash" }).click();

    // One line, above Total Payable. Scoped to the DIALOG: the order summary
    // behind it carries a row of the same name, which is deliberate — the
    // cashier sees the same figure in both places rather than a total that
    // changes when the dialog opens.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Points discount")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("− ৳150").first()).toBeVisible();
    // And NOT the wallet statement that used to live here.
    await expect(page.getByText("Points before this sale")).toHaveCount(0);
    await expect(page.getByText("Earned for next time")).toHaveCount(0);
    await expect(page.getByText("Points after this sale")).toHaveCount(0);
  });

  test("the Confirm button charges the discounted figure", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, SCHEME);
    await page.goto("/pos");
    await choose(page, "Arif Hossain");
    await ringUp(page);
    await boxOf(page).check();
    await page.getByRole("button", { name: "Pay Cash" }).click();

    // The bug this pins: the bill dropped and the tender box kept the old
    // figure, so Confirm charged more than the sale was worth — or, with the
    // box empty, none of it, and the sale was refused as credit.
    await expect(page.getByRole("button", { name: /Confirm ৳850/ })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("percentage mode prices the same points against the bill", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, { ...SCHEME, "loyalty.redeem_mode": "PERCENT", "loyalty.redeem_percent": "1" });
    await page.goto("/pos");
    await choose(page, "Arif Hossain");
    await ringUp(page);

    await boxOf(page).check();

    // 3 blocks at 1% is 3% of ৳1,000 — and the line leads with the PERCENTAGE,
    // because that is what the shop's poster promises.
    await expect(page.getByText(/3% discount/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Pay Cash" }).click();
    await expect(page.getByText("− ৳30").first()).toBeVisible();
  });

  test("unticking it puts the money back immediately", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, SCHEME);
    await page.goto("/pos");
    await choose(page, "Arif Hossain");
    await ringUp(page);

    await boxOf(page).check();
    await expect(page.getByText(/300 points used/)).toBeVisible({ timeout: 10_000 });

    await boxOf(page).uncheck();

    await expect(page.getByText(/300 points used/)).toHaveCount(0);
    await page.getByRole("button", { name: "Pay Cash" }).click();
    await expect(page.getByText("Points discount")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Confirm ৳1,000/ })).toBeVisible();
  });

  test("a customer with no points is told why, and cannot tick it", async ({ page }) => {
    await stubApi(page);
    await stubTill(page, SCHEME);
    await page.goto("/pos");

    await choose(page, "New Shopper");
    await ringUp(page);

    await expect(page.getByText(/No points yet/)).toBeVisible({ timeout: 10_000 });
    await expect(boxOf(page)).toBeDisabled();
  });
  test("the wallet updates the moment the sale is booked, with no reload", async ({ page }) => {
    // The defect: the picked customer is a SNAPSHOT held in the POS draft, so
    // the points beside their name were the figure captured when they were
    // chosen. The sale moved the balance on the server, the customer list
    // refetched with the new one — and the badge went on showing the old
    // number until somebody reloaded the till.
    await stubApi(page);
    await stubTillWithCheckout(page, SCHEME);
    await page.goto("/pos");
    await choose(page, "Arif Hossain");
    await ringUp(page);

    await expect(page.getByText("380 pts").first()).toBeVisible({ timeout: 15_000 });

    await boxOf(page).check();
    await page.getByRole("button", { name: "Pay Cash" }).click();
    await page.getByRole("button", { name: /^Confirm/ }).click();

    // 380 − 300 spent + 80 earned. No reload, no re-picking the customer.
    await expect(page.getByText("160 pts").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("380 pts")).toHaveCount(0);
  });
  test("the order summary carries the points on a row of its own", async ({ page }) => {
    // Its OWN row, not folded into Discount. That line is what the SHOP took
    // off — offers and whatever the cashier typed — and this is what the
    // customer paid for with points they had already earned. Added together
    // they would be one figure nobody could take apart.
    await stubApi(page);
    await stubTill(page, SCHEME);
    await page.goto("/pos");
    await choose(page, "Arif Hossain");
    await ringUp(page);

    await boxOf(page).check();

    const summary = page.getByText("Points discount", { exact: false }).first();
    await expect(summary).toBeVisible({ timeout: 10_000 });
    // And the Total agrees with the dialog rather than showing the gross.
    await expect(page.getByText("৳850").first()).toBeVisible();
  });
});
