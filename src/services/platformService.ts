import { apiList, apiFetch, ApiError, toAmount, PagedResult } from "./apiClient";

/**
 * The platform console — our own staff, reading across every company. No
 * shop-side call may do that. Works only with a console sign-in.
 */

export interface TenantRow {
  id: string;
  name: string;
  subdomain: string | null;
  plan: string | null;
  status: string | null;
  userCount: number;
  branchCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  /**
   * What this console account may actually do.
   *
   * `IsPlatformStaff` is only the realm gate; the ROLE decides what is
   * reachable, and an action whose code the caller does not hold is denied. So
   * an account with no role signs in successfully and is refused by every
   * screen — which is what happened to every account this console created,
   * because neither the form nor the API call named a role.
   */
  roles: string[];
}

/** A console role, as `/platform/roles/` returns it. */
export interface PlatformRoleRow {
  id: string;
  name: string;
  description: string;
  /** Seeded by `apps/platform/registry.py`; its NAME cannot be changed. */
  isSystem: boolean;
  permissions: string[];
}

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string;
  trialDays: number;
  maxBranches: number | null;
  maxUsers: number | null;
  maxProducts: number | null;
  isPublic: boolean;
  isActive: boolean;
}

/** What the plan editor sends. A null ceiling is "no limit". */
export interface PlanInput {
  code: string;
  name: string;
  description: string;
  price: number;
  interval: string;
  trialDays: number;
  maxBranches: number | null;
  maxUsers: number | null;
  maxProducts: number | null;
  isPublic: boolean;
  isActive: boolean;
}

export interface SubscriptionRow {
  id: string;
  organizationId: string;
  planName: string;
  planPrice: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  trialEndsAt: string | null;
}

export interface InvoiceRow {
  id: string;
  number: string;
  organizationId: string;
  status: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  planName: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
}

/** "PAST_DUE" -> "Past due". */
export function toLabel(value: string | null): string {
  if (!value) return "No plan";
  const words = value.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The date only, the way every table in the app shows one. */
const WHEN = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function toDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "—" : WHEN.format(at);
}

function toTenantRow(row: any): TenantRow {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    subdomain: row?.subdomain || null,
    plan: row?.plan || null,
    status: row?.subscriptionStatus || null,
    // Through the same helper as money, so a string from a future change
    // cannot quietly become "5" + 1 = "51".
    userCount: toAmount(row?.userCount),
    branchCount: toAmount(row?.branchCount),
    isActive: row?.isActive !== false,
    createdAt: String(row?.createdAt ?? ""),
  };
}

function toStaffRow(row: any): StaffRow {
  return {
    id: String(row?.id ?? ""),
    email: String(row?.email ?? ""),
    fullName: String(row?.fullName || row?.full_name || ""),
    phone: String(row?.phone || "—"),
    isActive: row?.isActive !== false,
    createdAt: String(row?.createdAt ?? ""),
    roles: Array.isArray(row?.roles) ? row.roles.map((r: unknown) => String(r)) : [],
  };
}

function toPlatformRoleRow(row: any): PlatformRoleRow {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    description: String(row?.description || ""),
    isSystem: row?.isSystem === true || row?.is_system === true,
    permissions: Array.isArray(row?.permissions) ? row.permissions.map(String) : [],
  };
}

function toPlanRow(row: any): PlanRow {
  const limit = (v: unknown) => (v === null || v === undefined ? null : toAmount(v));
  return {
    id: String(row?.id ?? ""),
    code: String(row?.code ?? ""),
    name: String(row?.name ?? ""),
    description: String(row?.description || ""),
    price: toAmount(row?.price),
    currency: String(row?.currencyCode || row?.currency_code || "BDT"),
    interval: String(row?.interval || "MONTHLY"),
    trialDays: toAmount(row?.trialDays ?? row?.trial_days),
    maxBranches: limit(row?.maxBranches ?? row?.max_branches),
    maxUsers: limit(row?.maxUsers ?? row?.max_users),
    maxProducts: limit(row?.maxProducts ?? row?.max_products),
    isPublic: row?.isPublic !== false,
    isActive: row?.isActive !== false,
  };
}

function toSubscriptionRow(row: any): SubscriptionRow {
  const plan = row?.plan || {};
  return {
    id: String(row?.id ?? ""),
    organizationId: String(row?.organization ?? ""),
    planName: String(plan?.name || "—"),
    planPrice: toAmount(plan?.price),
    status: String(row?.status || "—"),
    periodStart: String(row?.currentPeriodStart ?? row?.current_period_start ?? ""),
    periodEnd: String(row?.currentPeriodEnd ?? row?.current_period_end ?? ""),
    trialEndsAt: row?.trialEndsAt || row?.trial_ends_at || null,
  };
}

function toInvoiceRow(row: any): InvoiceRow {
  return {
    id: String(row?.id ?? ""),
    number: String(row?.number ?? row?.invoiceNumber ?? "—"),
    organizationId: String(row?.organization ?? ""),
    status: String(row?.status || "—"),
    total: toAmount(row?.total),
    amountPaid: toAmount(row?.amountPaid ?? row?.amount_paid),
    amountDue: toAmount(row?.amountDue ?? row?.amount_due),
    planName: String(row?.planName ?? row?.plan_name ?? "—"),
    issuedAt: String(row?.issuedAt ?? row?.issued_at ?? ""),
    dueAt: String(row?.dueAt ?? row?.due_at ?? ""),
    paidAt: row?.paidAt || row?.paid_at || null,
  };
}

export class PlatformService {
  static async listTenants(search?: string): Promise<PagedResult<TenantRow>> {
    const qs = search ? `?search=${encodeURIComponent(search)}&limit=200` : "?limit=200";
    return apiList<TenantRow>(`/platform/organizations/${qs}`, { method: "GET" }, toTenantRow);
  }

  static async listStaff(): Promise<PagedResult<StaffRow>> {
    return apiList<StaffRow>("/platform/staff/?limit=200", { method: "GET" }, toStaffRow);
  }

  /**
   * The console roles a staff account can be given.
   *
   * Read-only on the server: the four seeded roles come from
   * `apps/platform/registry.py` and are re-applied by a data migration, so one
   * edited over HTTP would be silently reverted.
   */
  static async listPlatformRoles(): Promise<PlatformRoleRow[]> {
    const rows = await apiFetch<any>("/platform/roles/", { method: "GET" });
    return (Array.isArray(rows) ? rows : []).map(toPlatformRoleRow);
  }

  /** Every platform permission code, grouped for a role editor to draw. */
  static async listPlatformPermissions(): Promise<PlatformRoleRow["permissions"]> {
    const roles = await PlatformService.listPlatformRoles();
    // Derived from the roles rather than fetched: the console has no
    // permission-catalogue endpoint, and Platform Owner holds every code by
    // definition, so the union across roles IS the catalogue. One request
    // instead of two, and it cannot drift from what a role may actually hold.
    return Array.from(new Set(roles.flatMap((r) => r.permissions))).sort();
  }

  /** Create a console role, or change what an existing one may do. */
  static async savePlatformRole(
    input: { name: string; description: string; permissions: string[] },
    existingId?: string
  ): Promise<void> {
    const body = {
      name: input.name,
      description: input.description,
      permissions: input.permissions,
    };
    if (existingId) {
      await apiFetch(`/platform/roles/${existingId}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return;
    }
    await apiFetch("/platform/roles/", { method: "POST", body: JSON.stringify(body) });
  }

  /**
   * Hand the console to somebody else.
   *
   * Adds an owner and removes none — stepping down is a separate edit, and the
   * server refuses it while the caller is the only active owner. So a handover
   * interrupted half-way leaves two owners rather than a console nobody can
   * administer.
   */
  static async transferOwnership(email: string, fullName = ""): Promise<void> {
    await apiFetch("/platform/staff/transfer-ownership/", {
      method: "POST",
      body: JSON.stringify({ email, full_name: fullName }),
    });
  }

  static async listPlans(): Promise<PagedResult<PlanRow>> {
    return apiList<PlanRow>("/platform/plans/?limit=200", { method: "GET" }, toPlanRow);
  }

  static async listSubscriptions(): Promise<PagedResult<SubscriptionRow>> {
    return apiList<SubscriptionRow>(
      "/platform/subscriptions/?limit=200",
      { method: "GET" },
      toSubscriptionRow
    );
  }

  static async listInvoices(): Promise<PagedResult<InvoiceRow>> {
    return apiList<InvoiceRow>("/platform/invoices/?limit=200", { method: "GET" }, toInvoiceRow);
  }

  /**
   * Company names for the id columns.
   *
   * Subscriptions and invoices carry only an organization id, so the caller
   * fetches the companies and looks the name up. The API sending the name
   * would save a call; it is in the report.
   */
  static async tenantNames(): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    try {
      const tenants = await PlatformService.listTenants();
      for (const t of tenants.data) out.set(t.id, t.name);
    } catch {
      // A console without this list still renders; the column shows the id.
    }
    return out;
  }

  // ── Writes the console API already supports ─────────────────────────────

  /** Close a company down, or open it again. */
  static async setCompanyActive(id: string, isActive: boolean): Promise<void> {
    await apiFetch(`/platform/organizations/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  /** Move a company onto another plan. `plan` is the plan's code. */
  static async changePlan(subscriptionId: string, plan: string): Promise<void> {
    await apiFetch(`/platform/subscriptions/${subscriptionId}/change-plan/`, {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
  }

  /** ACTIVE, PAST_DUE, SUSPENDED, CANCELLED — a person's decision, not a job's. */
  static async setSubscriptionStatus(id: string, status: string, note?: string): Promise<void> {
    await apiFetch(`/platform/subscriptions/${id}/status/`, {
      method: "POST",
      body: JSON.stringify({ status, note: note || "" }),
    });
  }

  static async cancelSubscription(id: string, atPeriodEnd: boolean): Promise<void> {
    await apiFetch(`/platform/subscriptions/${id}/cancel/`, {
      method: "POST",
      body: JSON.stringify({ at_period_end: atPeriodEnd }),
    });
  }

  /** Bill a company now, rather than waiting for the nightly run. */
  static async issueInvoice(subscriptionId: string, dueDays: number): Promise<void> {
    await apiFetch(`/platform/subscriptions/${subscriptionId}/issue-invoice/`, {
      method: "POST",
      body: JSON.stringify({ due_days: dueDays }),
    });
  }

  static async recordPayment(invoiceId: string, amount: number, method: string): Promise<void> {
    await apiFetch(`/platform/invoices/${invoiceId}/payments/`, {
      method: "POST",
      body: JSON.stringify({ amount: String(amount), method }),
    });
  }

  static async voidInvoice(invoiceId: string, reason: string): Promise<void> {
    await apiFetch(`/platform/invoices/${invoiceId}/void/`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  static async setStaffActive(id: string, isActive: boolean): Promise<void> {
    await apiFetch(`/platform/staff/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  /**
   * Take a plan off sale, or put it back.
   *
   * Addressed by CODE, not id: `/platform/plans/` looks a plan up on its code,
   * so an id here is a 404.
   */
  static async setPlanPublic(code: string, isPublic: boolean): Promise<void> {
    await apiFetch(`/platform/plans/${code}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: isPublic }),
    });
  }

  /**
   * Retire a plan, or bring it back.
   *
   * There is no delete, deliberately: `Plan.subscriptions` is RESTRICT and
   * every invoice stamps a plan code, so removing a row either fails on a live
   * subscription or erases the terms an issued invoice was written under.
   * `is_active=False` keeps the history and stops new sign-ups.
   */
  static async setPlanActive(code: string, isActive: boolean): Promise<void> {
    await apiFetch(`/platform/plans/${code}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  /**
   * Create a plan, or change one that exists.
   *
   * `POST /platform/plans/` and `PATCH /platform/plans/{code}/` have been on
   * the server since billing was written — `plan.create` and `plan.update` are
   * real permission codes with a service behind them — and nothing in this
   * console called either. The plans screen offered one action, the on-sale
   * toggle, so the price, the trial and every ceiling could only be changed by
   * editing `apps/billing/defaults.py` and re-running a management command.
   *
   * `code` is sent only on CREATE. `PlanService.update` refuses a changed one
   * with PLAN_CODE_IMMUTABLE, because an invoice stamps it and repointing a
   * code at different terms would make historical invoices read as though they
   * had been issued under the new ones.
   *
   * A null ceiling means "no limit" and is sent as null rather than omitted:
   * omitting it on a PATCH would leave the old number in place, which is the
   * opposite of what "Unlimited" was just typed to mean.
   */
  static async savePlan(input: PlanInput, existingCode?: string): Promise<void> {
    const body: Record<string, unknown> = {
      name: input.name,
      description: input.description,
      price: input.price.toFixed(4),
      interval: input.interval,
      trial_days: input.trialDays,
      max_branches: input.maxBranches,
      max_users: input.maxUsers,
      max_products: input.maxProducts,
      is_public: input.isPublic,
      is_active: input.isActive,
    };
    if (existingCode) {
      await apiFetch(`/platform/plans/${existingCode}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return;
    }
    await apiFetch("/platform/plans/", {
      method: "POST",
      body: JSON.stringify({ ...body, code: input.code }),
    });
  }

  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      const field = Object.values(error.errors || {})[0];
      if (Array.isArray(field) && field.length) return String(field[0]);
      return error.message;
    }
    return "Something went wrong. Please try again.";
  }

  /**
   * Create a console account, WITH what it may do.
   *
   * `roles` used not to be sent — nor accepted — so every account this made
   * held none, signed in fine and was refused by every console screen, with no
   * route to repair it short of the Django admin.
   */
  static async createStaff(payload: {
    email: string;
    fullName: string;
    password: string;
    roles: string[];
  }): Promise<void> {
    await apiFetch("/platform/staff/", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        full_name: payload.fullName,
        password: payload.password,
        roles: payload.roles,
      }),
    });
  }

  /** Change what an existing console account may do. */
  static async setStaffRoles(id: string, roles: string[]): Promise<void> {
    await apiFetch(`/platform/staff/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ roles }),
    });
  }

  /**
   * The server's own words for a field, if it named one.
   *
   * `describeError` returns the first field message for ANY field, which is
   * right for a banner and wrong for a form: the person needs to know that it
   * was the PASSWORD that was rejected, under the password box. Django's
   * password validators are the case that made this matter — "This password is
   * too common." came back as an unattributed sentence at the top of a dialog,
   * beside three fields, and read as "something went wrong".
   */
  static fieldError(error: unknown, field: string): string | null {
    if (!(error instanceof ApiError)) return null;
    const raw = (error.errors || {})[field];
    if (Array.isArray(raw) && raw.length) return String(raw[0]);
    if (typeof raw === "string" && raw) return raw;
    return null;
  }
}
