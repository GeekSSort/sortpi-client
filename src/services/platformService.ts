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
    return apiList<TenantRow>(`/platform/organizations/${qs}`, { method: "GET" }, undefined, toTenantRow);
  }

  static async listStaff(): Promise<PagedResult<StaffRow>> {
    return apiList<StaffRow>("/platform/staff/?limit=200", { method: "GET" }, undefined, toStaffRow);
  }

  static async listPlans(): Promise<PagedResult<PlanRow>> {
    return apiList<PlanRow>("/platform/plans/?limit=200", { method: "GET" }, undefined, toPlanRow);
  }

  static async listSubscriptions(): Promise<PagedResult<SubscriptionRow>> {
    return apiList<SubscriptionRow>(
      "/platform/subscriptions/?limit=200",
      { method: "GET" },
      undefined,
      toSubscriptionRow
    );
  }

  static async listInvoices(): Promise<PagedResult<InvoiceRow>> {
    return apiList<InvoiceRow>("/platform/invoices/?limit=200", { method: "GET" }, undefined, toInvoiceRow);
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

  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      const field = Object.values(error.errors || {})[0];
      if (Array.isArray(field) && field.length) return String(field[0]);
      return error.message;
    }
    return "Something went wrong. Please try again.";
  }

  static async createStaff(payload: { email: string; fullName: string; password: string }): Promise<void> {
    await apiFetch("/platform/staff/", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        full_name: payload.fullName,
        password: payload.password,
      }),
    });
  }
}
