/**
 * The permission catalogue, and the page-shaped view of it the role editor
 * offers.
 *
 * The codes themselves come from `GET /permissions/` — never a copy kept here.
 * A copy drifts, and a role screen that has quietly stopped offering a code is
 * indistinguishable from one where the code was deliberately withheld.
 *
 * What IS defined here is the mapping from a page an owner recognises to the
 * modules behind it. That is a property of this app's navigation, not of the
 * API, so it belongs on this side.
 */

export interface PermissionRecord {
  id: string;
  /** Which module the API files it under: "product", "sale", "hrm"... */
  module: string;
  /** The code the server enforces: "product.create". */
  code: string;
  description: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  description: string;
  /** Seeded roles cannot be deleted; their permissions are still editable. */
  isSystem: boolean;
  permissions: string[];
  /**
   * Branch ids this role can SEE, beside wherever its holder is standing.
   *
   * Empty is the normal case: holders see only their own branches. A role that
   * names branches widens every holder's read scope, which is why the server
   * refuses branches the author cannot reach themselves.
   */
  branches: string[];
}

export interface RolePayload {
  name: string;
  description?: string;
  permissions: string[];
  branches: string[];
}

/** One row in the editor: a page, and the API modules it is built from. */
export interface PageGroup {
  key: string;
  label: string;
  hint: string;
  modules: string[];
}

/**
 * Pages as this app's sidebar names them, mapped to API modules.
 *
 * Grouped by page rather than by module because that is the question an owner
 * is actually answering — "can this person open Payroll?" — while the codes
 * underneath stay exactly what the server enforces, one expander away.
 */
export const PAGE_GROUPS: PageGroup[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    hint: "Overview figures and charts",
    modules: ["dashboard"],
  },
  { key: "pos", label: "POS / Till", hint: "Selling at the counter", modules: ["pos", "sync"] },
  { key: "sales", label: "Sales & Returns", hint: "Invoices, refunds, cancellations", modules: ["sale"] },
  {
    key: "inventory",
    label: "Inventory",
    hint: "Products, stock, transfers, warehouses",
    modules: ["product", "inventory", "category", "brand", "unit", "tax", "warehouse"],
  },
  {
    key: "purchases",
    label: "Purchases",
    hint: "Purchase orders, receiving, suppliers",
    modules: ["purchase", "supplier"],
  },
  { key: "customers", label: "Customers", hint: "Customer records and ledgers", modules: ["customer"] },
  {
    key: "finance",
    label: "Finance",
    hint: "Accounts, expenses, profit and loss",
    modules: ["finance", "expense"],
  },
  { key: "hrm", label: "HR & Payroll", hint: "Employees, attendance, salaries", modules: ["hrm"] },
  { key: "reports", label: "Reports", hint: "Every report and its export", modules: ["report"] },
  {
    key: "admin",
    label: "Users & Roles",
    hint: "Staff accounts, roles, branches",
    modules: ["user", "role", "branch"],
  },
  {
    key: "settings",
    label: "Settings & Billing",
    hint: "Company settings, plan, audit log, alerts",
    modules: ["settings", "billing", "audit", "notification"],
  },
];

/**
 * A module the map above forgot still has to be reachable.
 *
 * Otherwise adding a module server-side silently removes its codes from every
 * role screen — the drift this file exists to avoid, arriving by the back door.
 */
export const OTHER_GROUP: PageGroup = {
  key: "other",
  label: "Other",
  hint: "Codes not covered by a page above",
  modules: [],
};

export function groupPermissions(
  permissions: PermissionRecord[]
): { group: PageGroup; codes: PermissionRecord[] }[] {
  const claimed = new Set(PAGE_GROUPS.flatMap((g) => g.modules));
  const groups = PAGE_GROUPS.map((group) => ({
    group,
    codes: permissions.filter((p) => group.modules.includes(p.module)),
  })).filter((row) => row.codes.length > 0);

  const leftovers = permissions.filter((p) => !claimed.has(p.module));
  return leftovers.length > 0 ? [...groups, { group: OTHER_GROUP, codes: leftovers }] : groups;
}
