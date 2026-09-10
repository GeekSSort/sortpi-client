import { test, expect } from "@playwright/test";

import {
  BACK_OFFICE_PAGES,
  POS_HOME,
  canOpenPage,
  firstBackOfficePage,
  hasBackOffice,
} from "../src/lib/pageAccess";
import { homeFor } from "../src/services/authService";
import { frontDoor } from "../src/lib/frontDoor";

/**
 * Where each role lands, and what its menu offers.
 *
 * Pure functions, so no browser is driven here — but they decide whether a
 * role can use the product at all, and both had a defect that no screenshot
 * would have shown.
 *
 * The permission sets below are the seeded roles from
 * `apps/accounts/permissions_registry.py`, trimmed to the codes these two
 * functions read. Trimmed rather than complete on purpose: a full copy would
 * drift silently, while the codes that matter are the ones under test.
 */

const CASHIER = [
  "pos.access",
  "pos.hold_sale",
  "pos.shift_open",
  "pos.shift_close",
  "sale.create",
  "sale.view_own",
  "product.view",
  "inventory.view",
  "sync.view",
  "sync.create",
];

const BRANCH_MANAGER = [
  ...CASHIER,
  "sale.view",
  "sale.cancel",
  "sale.refund",
  "report.sales",
  "report.inventory",
  "report.purchase",
  "report.finance",
  "report.customer",
  "report.supplier",
  "report.export",
  "inventory.adjust",
  "inventory.view_movements",
];

const INVENTORY = [
  "product.view",
  "product.create",
  "product.update",
  "purchase.view",
  "purchase.create",
  "purchase.confirm",
  "purchase.receive",
  "supplier.view",
  "inventory.view",
  "inventory.transfer",
  "inventory.receive_transfer",
  "report.inventory",
  "report.purchase",
  "category.view",
  "brand.view",
];

const ACCOUNTANT = [
  "dashboard.view",
  "finance.view",
  "finance.view_pl",
  "expense.view",
  "customer.view",
  "supplier.view",
  "report.sales",
  "report.finance",
  "sale.view",
  "product.view",
  "inventory.view",
];

const ADMIN = [
  ...ACCOUNTANT,
  ...INVENTORY,
  ...BRANCH_MANAGER,
  "dashboard.view_all_branch",
  "user.view",
  "role.view",
  "settings.view",
  "hrm.view",
  "branch.view",
];

test.describe("where a role lands after sign-in", () => {
  test("a cashier goes to the till, because the till is all they have", () => {
    expect(homeFor(CASHIER)).toBe(POS_HOME);
    expect(hasBackOffice(CASHIER)).toBe(false);
  });

  test("a branch manager gets a back office, not the till", () => {
    // `homeFor` was `dashboard.view ? "/dashboard" : "/pos"`, and a Branch
    // Manager holds every report code and not that one — so they landed on
    // /pos and `proxy.ts` then redirected them away from /reports, the pages
    // their permissions exist for.
    expect(homeFor(BRANCH_MANAGER)).not.toBe(POS_HOME);
    expect(hasBackOffice(BRANCH_MANAGER)).toBe(true);
    expect(canOpenPage("/reports", BRANCH_MANAGER)).toBe(true);
    expect(canOpenPage("/sales-pos/sales", BRANCH_MANAGER)).toBe(true);
    // ...and the till's own codes are not what put them there: a Cashier holds
    // product.view, inventory.view and sale.view_own too.
    expect(hasBackOffice(CASHIER)).toBe(false);
  });

  test("the inventory role gets the pages it owns", () => {
    // 42 permissions covering the whole purchase lifecycle, and it landed on
    // the till screen.
    expect(homeFor(INVENTORY)).not.toBe(POS_HOME);
    expect(canOpenPage("/purchases", INVENTORY)).toBe(true);
    expect(canOpenPage("/purchases/suppliers", INVENTORY)).toBe(true);
    expect(canOpenPage("/inventory/transfers", INVENTORY)).toBe(true);
  });

  test("dashboard.view still wins when it is held", () => {
    expect(homeFor(ACCOUNTANT)).toBe("/dashboard");
    expect(homeFor(ADMIN)).toBe("/dashboard");
  });

  test("an account with no permissions at all falls back to the till", () => {
    expect(homeFor([])).toBe(POS_HOME);
    expect(homeFor(undefined)).toBe(POS_HOME);
    expect(hasBackOffice([])).toBe(false);
  });

  test("everybody lands somewhere they can actually open", () => {
    for (const [name, codes] of Object.entries({
      CASHIER,
      BRANCH_MANAGER,
      INVENTORY,
      ACCOUNTANT,
      ADMIN,
    })) {
      const home = homeFor(codes);
      if (home === POS_HOME) continue;
      expect(canOpenPage(home, codes), `${name} lands on ${home} and cannot open it`).toBe(true);
    }
  });
});

test.describe("what the menu offers", () => {
  test("a page is matched on its longest prefix", () => {
    // /inventory/stock has its own code and must not be answered by
    // /inventory's.
    const catalogueOnly = ["product.update"];
    expect(canOpenPage("/inventory", catalogueOnly)).toBe(true);
    expect(canOpenPage("/inventory/stock", catalogueOnly)).toBe(false);
    expect(canOpenPage("/inventory/add", catalogueOnly)).toBe(true);
  });

  test("an accountant is not offered HRM, roles or settings", () => {
    expect(canOpenPage("/hrm", ACCOUNTANT)).toBe(false);
    expect(canOpenPage("/roles-permissions", ACCOUNTANT)).toBe(false);
    expect(canOpenPage("/settings", ACCOUNTANT)).toBe(false);
    // ...and is offered what it does hold.
    expect(canOpenPage("/customers", ACCOUNTANT)).toBe(true);
    expect(canOpenPage("/reports", ACCOUNTANT)).toBe(true);
  });

  test("an admin is offered everything", () => {
    for (const page of BACK_OFFICE_PAGES) {
      expect(canOpenPage(page.href, ADMIN), `admin cannot open ${page.href}`).toBe(true);
    }
  });

  test("an unmapped path is not gated here", () => {
    // The API refuses what it must; inventing a code for a page nobody mapped
    // would hide screens for no stated reason.
    expect(canOpenPage("/ds-preview", [])).toBe(true);
  });

  test("the first page offered is the first one in the menu order", () => {
    // `homeFor` sends somebody to the first page they can open, so that order
    // is load-bearing rather than incidental.
    expect(firstBackOfficePage(ADMIN)).toBe(BACK_OFFICE_PAGES[0].href);
    expect(firstBackOfficePage(INVENTORY)).toBe("/inventory");
  });
});

/**
 * Where the bare domain sends a signed-out visitor.
 *
 * Three deployments, three right answers. The first version of this asked one
 * question — "is this a tenant host?" — and a single-tenant deployment, which
 * has no base domain configured and therefore no apex to register at, came out
 * as "platform" and would have offered strangers a sign-up form on a shop's
 * own address. Pure function, so all three are asserted here rather than by
 * standing up a deployment for each.
 */
function describe_frontDoor() {
  const PLATFORM = { baseDomain: "sortpi.com", platformHosts: "admin.sortpi.com" };

  test("the platform apex opens on sign-up", () => {
    expect(frontDoor({ host: "sortpi.com", ...PLATFORM })).toBe("/signup");
    // The port must not change the answer.
    expect(frontDoor({ host: "sortpi.com:3500", ...PLATFORM })).toBe("/signup");
  });

  test("an extra platform host opens on sign-up too", () => {
    expect(frontDoor({ host: "admin.sortpi.com", ...PLATFORM })).toBe("/signup");
  });

  test("a company's own address opens on sign-in", () => {
    expect(frontDoor({ host: "nusrat.sortpi.com", ...PLATFORM })).toBe("/login");
    expect(frontDoor({ host: "nusrat.sortpi.com:3500", ...PLATFORM })).toBe("/login");
  });

  test("a single-tenant deployment opens on sign-in, not sign-up", () => {
    // No base domain: one shop, one domain, no apex. Sending these visitors to
    // /signup would invite strangers to create companies on the shop's own
    // address — and it is a regression from the /login that was there before.
    expect(frontDoor({ host: "shop.example.com", baseDomain: "", platformHosts: "" })).toBe("/login");
    expect(
      frontDoor({ host: "shop.example.com", baseDomain: undefined, platformHosts: undefined })
    ).toBe("/login");
  });

  test("a host nobody configured opens on sign-in", () => {
    // An unknown door must not offer to create companies.
    expect(frontDoor({ host: "evil.example.net", ...PLATFORM })).toBe("/login");
    expect(frontDoor({ host: null, ...PLATFORM })).toBe("/login");
    expect(frontDoor({ host: "", ...PLATFORM })).toBe("/login");
  });
}

describe_frontDoor();

/**
 * The deploy check, which has to answer a caller holding no cookies.
 *
 * `/build-id` returns the commit baked into the bundle, and the pipeline
 * compares it against the commit it just deployed. The route guard's matcher
 * catches it — no file extension, not under `_next` — so it was answered with
 * a redirect to `/login?next=%2Fbuild-id`, and the pipeline compared THAT
 * against the SHA. Twelve attempts, twelve redirects, and a failed verify on a
 * deploy that had actually worked.
 *
 * Signed OUT on purpose: the shared `storageState` carries a session, and with
 * one this passes no matter what the guard does.
 */
test.describe("the deploy check", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("/build-id answers with no session and is not a redirect", async ({ request }) => {
    const response = await request.get("/build-id", { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");

    const body = (await response.text()).trim();
    // The failure this exists for: the redirect body is the login path.
    expect(body).not.toContain("/login");
    // A SHA when CI builds it, "unknown" locally — never empty either way.
    expect(body).not.toBe("");
  });
});
