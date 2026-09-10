import type { Page } from "@playwright/test";

/**
 * Answer every API call with a plausible, signed-in reply.
 *
 * Without this the browser reaches nothing, `/auth/me` fails, and `endSession`
 * in `apiClient.ts` sends the tab to `/login?next=…`. A layout test that
 * navigates to thirty routes and measures the LOGIN PAGE thirty times passes
 * cheerfully and proves nothing — which is exactly what the first run of
 * `responsive.spec.ts` did.
 *
 * So the session is real here, the shell renders, and the assertions land on
 * the screen they name. The lists come back empty on purpose: an empty list
 * still paints the table header at its `min-w-[…]` floor, which is the part
 * that overflows, and it also exercises the empty state — which on a phone is
 * the branch that had nothing in it at all until recently.
 */

/** Every permission code the seeded Admin holds, so no page is hidden. */
const ALL_PERMISSIONS = [
  "dashboard.view",
  "pos.access",
  // The discounts screen goes read-only without this one.
  "pos.manual_discount",
  "sale.view",
  "sale.create",
  "sale.refund",
  "sale.cancel",
  "sale.view_profit",
  "customer.view",
  "customer.create",
  "customer.update",
  "product.view",
  "product.create",
  "product.update",
  "product.import",
  "product.view_cost",
  "inventory.view",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.view_movements",
  "purchase.view",
  "purchase.create",
  "purchase.confirm",
  "supplier.view",
  "supplier.create",
  "supplier.pay",
  "report.sales",
  "report.inventory",
  "report.purchase",
  "report.finance",
  "report.customer",
  "report.supplier",
  "report.export",
  "discount.view",
  "discount.create",
  "hrm.view",
  "hrm.create",
  "payroll.view",
  "payroll.run",
  "user.view",
  "user.create",
  "role.view",
  "role.update",
  "settings.view",
  "settings.update",
  "branch.view",
  "branch.create",
  "billing.view",
  "billing.manage",
];

const BRANCHES = [
  { id: "b-1", code: "DHK", name: "Dhaka — Head Office", is_active: true },
  { id: "b-2", code: "CTG", name: "Chattogram", is_active: true },
];

const ME = {
  id: "u-1",
  email: "owner@acme.example",
  first_name: "Arif",
  last_name: "Ahmed",
  roles: ["Admin"],
  permissions: ALL_PERMISSIONS,
  active_branch: BRANCHES[0],
  subscription: { plan: "Starter", plan_code: "starter", status: "ACTIVE" },
  organization: { id: "o-1", name: "Acme Retail" },
};

const CATEGORIES = [
  { id: "cat-1", name: "Beverages" },
  { id: "cat-2", name: "Snacks" },
  { id: "cat-3", name: "Household" },
];

/** 30 products over three categories: two pages at the default page size. */
const PRODUCTS = Array.from({ length: 30 }, (_, i) => {
  const cat = CATEGORIES[i % CATEGORIES.length];
  return {
    id: `p-${i + 1}`,
    name: `Product ${String(i + 1).padStart(2, "0")}`,
    category: cat.id,
    category_name: cat.name,
    is_active: true,
    variants: [
      {
        id: `v-${i + 1}`,
        sku: `SKU-${i + 1}`,
        is_default: true,
        price: "100.0000",
        barcodes: [],
      },
    ],
    images: [],
  };
});

/** The envelope every endpoint here answers in. */
function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ success: true, data, ...extra });
}

export async function stubApi(
  page: Page,
  /**
   * Narrow the signed-in account.
   *
   * `without` drops permission codes, which is how a screen's permission
   * gating gets tested: the alternative is a second route handler racing this
   * one, and Playwright runs the LAST registered handler first, so that fights
   * the stub rather than layering on it.
   */
  options: { without?: string[]; subscription?: Record<string, unknown> | null } = {}
) {
  const permissions = ALL_PERMISSIONS.filter((code) => !(options.without ?? []).includes(code));
  // `subscription` for the same reason as `without`: the plan block drives the
  // Upgrade dialog's whole arithmetic, and the default here carries no limits
  // at all. Overriding it from a second route handler means re-sending the
  // permission list too, and forgetting to is indistinguishable from a signed
  // out session — every gated control simply absent, the page still painting.
  const me = {
    ...ME,
    permissions,
    ...(options.subscription !== undefined ? { subscription: options.subscription } : {}),
  };
  /**
   * Discounts that have been PUT during this test.
   *
   * Not decoration: the discounts screen saves optimistically and then
   * `invalidate("discounts")` re-reads `/products/discounts/`. A stub that
   * always answered with an empty list wiped the offer a moment after it was
   * set, so a test could never tell a working save from a broken one — the
   * screen looked exactly the same either way.
   */
  const discounts = new Map<string, Record<string, unknown>>();

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");

    const body = (() => {
      // Both realms. On a bare `localhost` the client resolves to the CONSOLE
      // and asks `/platform/auth/me`; a shop subdomain asks `/auth/me`. Match
      // only the first and the session silently stays null — the shell still
      // paints, so the page looks right and every control gated on a
      // permission is simply absent. That is how this stub first "passed".
      if (path.includes("/auth/me")) return ok(me);
      if (path.includes("/auth/logout")) return ok({});
      if (path.startsWith("/branches")) return ok(BRANCHES, { total: BRANCHES.length });
      if (path.startsWith("/notifications/unread")) return ok({ count: 0 });
      if (path.startsWith("/settings/resolved")) return ok([]);
      if (path.startsWith("/categories")) return ok(CATEGORIES, { total: CATEGORIES.length });
      // The CSV export is not JSON, so it is answered before the envelope
      // handlers below and with the headers the download helper reads.
      if (path.startsWith("/products/export")) return "__CSV__";
      if (path.startsWith("/products/import")) {
        // A dry run reports; a real run creates. The screen must tell them
        // apart, so the stub does too.
        const dry = /dry_run"?\r?\n?\s*true/i.test(route.request().postData() || "");
        return ok({
          dry_run: dry,
          total: 3,
          valid: 2,
          created: dry ? 0 : 2,
          failed: 1,
          rows: [
            { line: 2, status: "created", name: "Rice 5kg", sku: "R5", code: null, message: null },
            { line: 3, status: "created", name: "Dal 1kg", sku: "D1", code: null, message: null },
            {
              line: 4,
              status: "error",
              name: "Ghee 500g",
              sku: "G5",
              code: "UNKNOWN_CATEGORY",
              message: "No category named 'Dairy' exists. Create it before importing.",
            },
          ],
        });
      }
      if (path.startsWith("/products/discounts"))
        return ok([...discounts.values()], { total: discounts.size });
      if (/^\/products\/[^/]+\/discount/.test(path)) {
        const method = route.request().method();
        const body = (() => {
          try {
            return JSON.parse(route.request().postData() || "{}");
          } catch {
            return {};
          }
        })();
        const variant = String(body.variant ?? "");
        if (method === "DELETE") {
          discounts.delete(variant);
          return ok({});
        }
        const row = {
          id: `d-${variant}`,
          variant,
          branch: null,
          mode: body.mode,
          value: String(body.value),
          is_active: true,
        };
        discounts.set(variant, row);
        return ok(row);
      }
      // More products than one page (16) and spread over three categories —
      // the shape that made "select all" mean "these sixteen".
      if (path.startsWith("/products")) return ok(PRODUCTS, { total: PRODUCTS.length });
      if (path.startsWith("/inventory/stock")) return ok([], { total: 0 });
      // A customer with two open invoices, one of which owes a figure with
      // FOUR decimal places — 4338.5950 is exactly the case that broke: the
      // dialog rounded it up to 4338.6000 and the server refused its own
      // dialog's arithmetic.
      if (/^\/customers\/[^/]+\/invoices/.test(path))
        return ok([
          {
            id: "s-1",
            invoice_number: "MAIN-26-000125",
            sale_date: "2026-08-02T10:00:00Z",
            branch_name: "Dhaka",
            grand_total: "5661.4050",
            paid_amount: "0.0000",
            outstanding: "5661.4050",
          },
          {
            id: "s-2",
            invoice_number: "MAIN-26-000126",
            sale_date: "2026-08-09T10:00:00Z",
            branch_name: "Dhaka",
            grand_total: "4338.5950",
            paid_amount: "0.0000",
            outstanding: "4338.5950",
          },
        ]);
      if (/^\/customers\/[^/]+\/payments/.test(path))
        return ok({ balance_after: "0.0000" });
      if (/^\/customers\/[^/]+\/?$/.test(path))
        return ok({
          id: "c-1",
          code: "CUS-001",
          name: "Arif Ahmed",
          phone: "01712345678",
          email: "arif@example.com",
          customer_type: "RETAIL",
          current_balance: "10000.0000",
          total_spent: "42000.0000",
          order_count: 6,
          is_active: true,
        });
      if (path.startsWith("/customers"))
        return ok(
          [
            {
              id: "c-1",
              code: "CUS-001",
              name: "Arif Ahmed",
              phone: "01712345678",
              email: "arif@example.com",
              customer_type: "RETAIL",
              current_balance: "10000.0000",
              total_spent: "42000.0000",
              order_count: 6,
              is_active: true,
            },
          ],
          { total: 1, page: 1, limit: 20 }
        );
      if (path.startsWith("/billing/plans") || path.startsWith("/plans")) return ok([], { total: 0 });
      // Anything else: an empty page of results. `total`, `page` and `limit`
      // are read by the pagination bar, so they have to be present and honest.
      return ok([], { total: 0, page: 1, limit: 20 });
    })();

    if (body === "__CSV__") {
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "Content-Disposition",
          "content-disposition": 'attachment; filename="products.csv"',
        },
        body: "name,category,unit\nRice 5kg,Grains,Piece\n",
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body,
    });
  });

  // The client only sends `Authorization` when it holds a token, and some
  // screens short-circuit without one. A fake is enough — nothing verifies it.
  await page.addInitScript(() => {
    try {
      // The names `tokenStore` in apiClient.ts actually reads.
      window.localStorage.setItem("access_token", "test-access-token");
      window.localStorage.setItem("token", "test-access-token");
      window.localStorage.setItem("refresh_token", "test-refresh-token");
    } catch {
      /* private mode: the stubbed API answers regardless */
    }
  });
}
