import { apiFetch, ApiError, toAmount } from "./apiClient";

/**
 * What this company pays for, and moving it up a plan.
 *
 * The console's own billing screens are `platformService.ts`. These are the
 * TENANT's view of its own account: the price list every organization sees,
 * and the one change a tenant may make to what it is on.
 */

/** A plan, as a tenant sees it. A null ceiling means no limit. */
export interface UpgradePlan {
  code: string;
  name: string;
  description: string;
  price: number;
  interval: string;
  trialDays: number;
  limits: Record<string, number | null>;
}

function toPlan(row: any): UpgradePlan {
  // `null` stays null — no ceiling — and anything absent becomes null too:
  // a plan row that did not state a limit is one with no limit, which is what
  // the serializer means by omitting it. Both spellings are read because
  // `snakeToCamelCase` rewrites every key in the response.
  const limit = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    code: String(row?.code ?? ""),
    name: String(row?.name ?? ""),
    description: String(row?.description || ""),
    price: toAmount(row?.price),
    interval: String(row?.interval || "MONTHLY"),
    trialDays: Number(row?.trialDays ?? row?.trial_days ?? 0),
    limits: {
      max_branches: limit(row?.maxBranches ?? row?.max_branches),
      max_users: limit(row?.maxUsers ?? row?.max_users),
      max_products: limit(row?.maxProducts ?? row?.max_products),
    },
  };
}

export class BillingService {
  /** The plans this organization could move to. Public and active only. */
  static async plans(): Promise<UpgradePlan[]> {
    const rows = await apiFetch<any>("/billing/plans/", { method: "GET" });
    return (Array.isArray(rows) ? rows : []).map(toPlan);
  }

  /**
   * Move the organization onto a bigger plan.
   *
   * UP only, and the server owns the rule: a plan that lowers ANY ceiling is
   * refused with `PLAN_DOWNGRADE_NOT_ALLOWED`. The dialog greys those rows out
   * so the refusal is rare, but the check that MATTERS is the one behind this
   * call — a client that greys out the wrong rows is a UI bug, not a billing
   * one.
   */
  static async upgrade(planCode: string): Promise<void> {
    await apiFetch("/billing/subscription/upgrade", {
      method: "POST",
      body: JSON.stringify({ plan_code: planCode }),
    });
  }

  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "PLAN_DOWNGRADE_NOT_ALLOWED") return error.message;
      if (error.code === "PLAN_UNCHANGED") return "You are already on that plan.";
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      return error.message;
    }
    return "Something went wrong. Please try again.";
  }
}
