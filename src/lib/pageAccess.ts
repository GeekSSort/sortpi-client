/**
 * Which permission a back-office page needs to be worth opening.
 *
 * This map did not exist, and two separate defects came out of not having it.
 *
 * **Where somebody lands.** `homeFor()` sent anyone without `dashboard.view`
 * to `/pos`, and `proxy.ts` then wrote `sp_scope=pos` and hard-blocked every
 * back-office path for them. Only two of the five seeded roles hold
 * `dashboard.view` — Accountant and Admin. So a **Branch Manager**, who holds
 * every `report.*` code, and the **Inventory** role, which owns the purchase
 * lifecycle end to end across 42 permissions, were both dropped into the
 * till-only shell and could not reach `/inventory`, `/purchases` or
 * `/reports` at all. `dashboard.view` gates ONE WIDGET SET; it was being read
 * as "may use the back office".
 *
 * **What the menu shows.** The sidebar listed all thirteen destinations to
 * everybody who reached it, so an Accountant saw HRM, Roles & Permissions and
 * Settings and got a 403 from each. Hiding a row is not a security control —
 * the server refuses these regardless, which is where the control belongs —
 * but a menu that offers what it cannot open is a menu nobody trusts.
 *
 * The codes below mirror the `permission_map` on each viewset. ANY of them is
 * enough to open the page: `/reports` is one screen over seven report codes,
 * and a role holding one of them has a reason to be there.
 *
 * Where a page's own gate is a code the TILL also needs, the map names the
 * back-office half instead. A Cashier holds `product.view` so the till can
 * draw its product wall, `inventory.view` so a tile can show a stock badge and
 * `sale.view_own` so they can reprint their own receipt — none of those is a
 * reason to move somebody out of the till environment, and taking them at face
 * value put every cashier in the back office. `proxy.ts` already maps the
 * cashier's copies of those screens (`/pos/products`, `/pos/sales`) to the
 * back-office addresses for anyone who does belong there.
 */

export interface PageAccess {
  href: string;
  /** Any one of these is enough. Empty means everybody. */
  codes: string[];
}

/**
 * In the order the sidebar lists them, because `homeFor` sends somebody to the
 * FIRST page they can open and the first one in the menu is the one they would
 * have clicked.
 */
export const BACK_OFFICE_PAGES: PageAccess[] = [
  { href: "/dashboard", codes: ["dashboard.view"] },
  // The SHOP's sales. `sale.view_own` is the cashier reprinting their own
  // receipt, which the till serves at /pos/sales.
  { href: "/sales-pos/sales", codes: ["sale.view"] },
  { href: "/sales-pos/return", codes: ["sale.view", "sale.refund"] },
  // MANAGING the catalogue, not reading it: `product.view` is what the till's
  // product wall needs.
  {
    href: "/inventory",
    codes: [
      "product.create",
      "product.update",
      "product.delete",
      "product.import",
      "product.update_price",
      "product.view_cost",
    ],
  },
  // Same rule: `inventory.view` is the till's stock badge.
  {
    href: "/inventory/stock",
    codes: ["inventory.adjust", "inventory.view_movements", "inventory.view_valuation"],
  },
  { href: "/inventory/transfers", codes: ["inventory.transfer", "inventory.receive_transfer"] },
  { href: "/purchases", codes: ["purchase.view"] },
  { href: "/purchases/suppliers", codes: ["supplier.view"] },
  { href: "/customers", codes: ["customer.view"] },
  {
    href: "/reports",
    codes: [
      "report.sales",
      "report.inventory",
      "report.purchase",
      "report.finance",
      "report.customer",
      "report.supplier",
    ],
  },
  { href: "/discount", codes: ["product.update", "product.update_price"] },
  { href: "/hrm", codes: ["hrm.view"] },
  { href: "/roles-permissions", codes: ["role.view", "user.view"] },
  { href: "/settings", codes: ["settings.view"] },
];

/** The one page that is not back office: the till itself. */
export const POS_HOME = "/pos";

function holds(permissions: string[] | undefined, codes: string[]): boolean {
  if (codes.length === 0) return true;
  if (!permissions || permissions.length === 0) return false;
  return codes.some((code) => permissions.includes(code));
}

/**
 * Whether this account can open a given back-office path.
 *
 * Matched on the LONGEST declared prefix, so `/inventory/stock` is answered by
 * its own entry rather than by `/inventory`. A path with no entry — an
 * unlisted sub-route, `/ds-preview` — is not gated here; the API is what
 * refuses those, and guessing a code for a page nobody mapped would hide
 * screens for no stated reason.
 */
export function canOpenPage(pathname: string, permissions: string[] | undefined): boolean {
  const entry = BACK_OFFICE_PAGES.filter(
    (page) => pathname === page.href || pathname.startsWith(`${page.href}/`)
  ).sort((a, b) => b.href.length - a.href.length)[0];
  return entry ? holds(permissions, entry.codes) : true;
}

/**
 * The first back-office page this account can actually open, or null.
 *
 * Null is the till-only account — a Cashier — and only then does `/pos` become
 * somebody's home.
 */
export function firstBackOfficePage(permissions: string[] | undefined): string | null {
  const found = BACK_OFFICE_PAGES.find((page) => holds(permissions, page.codes));
  return found ? found.href : null;
}

/**
 * True when this account has any back office at all.
 *
 * `proxy.ts` runs before the page and cannot read permissions, so sign-in
 * writes this answer to the `sp_scope` cookie for it. The cookie has to mean
 * "has a back office", not "has a dashboard".
 */
export function hasBackOffice(permissions: string[] | undefined): boolean {
  return firstBackOfficePage(permissions) !== null;
}
