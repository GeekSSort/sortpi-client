import { apiFetch, apiList, toAmount } from "./apiClient";

/**
 * Coupon codes — set up in Settings, honoured at the till.
 *
 * `check` is the ONE thing the POS calls, and what it answers is not what gets
 * charged: `POST /sales/` resolves the code again from the coupon row and
 * prices the sale from that. This exists so a cashier learns the answer before
 * the customer does, not so the till can decide it.
 *
 * That split is the whole reason the coupon field on the POS was disabled for
 * so long. The version before it worked the discount out in the browser — a
 * real 10% off for the literal string "SAVE10" — and posted the reduced
 * figure, which is money off with no authority behind it anywhere.
 */

/** PERCENT: a share of the bill. FLAT: a fixed number of taka. */
export type CouponMode = "PERCENT" | "FLAT";

export interface Coupon {
  id: string;
  code: string;
  mode: CouponMode;
  /** 10 means 10% in PERCENT mode and ৳10 in FLAT mode. */
  value: number;
  isActive: boolean;
  description: string;
}

/** What a code is worth against ONE bill. */
export interface CouponCheck {
  code: string;
  mode: CouponMode;
  value: number;
  /** What it takes off this bill. The figure the till shows. */
  discount: number;
  description: string;
}

export interface CouponInput {
  code: string;
  mode: CouponMode;
  value: number;
  isActive?: boolean;
  description?: string;
}

function toCoupon(row: any): Coupon {
  return {
    id: String(row?.id ?? ""),
    code: String(row?.code ?? ""),
    mode: String(row?.mode ?? "PERCENT").toUpperCase() === "FLAT" ? "FLAT" : "PERCENT",
    value: toAmount(row?.value),
    isActive: Boolean(row?.isActive ?? row?.is_active ?? true),
    description: String(row?.description ?? ""),
  };
}

export class CouponService {
  static async list(): Promise<Coupon[]> {
    const rows = await apiList<any>("/coupons/?limit=200", { method: "GET" }, (r) => r);
    return (rows.data || []).map(toCoupon);
  }

  static async create(input: CouponInput): Promise<Coupon> {
    return toCoupon(
      await apiFetch<any>("/coupons/", {
        method: "POST",
        body: JSON.stringify({
          code: input.code.trim(),
          mode: input.mode,
          // Four decimals as a STRING, like every other money figure here.
          value: input.value.toFixed(4),
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
          ...(input.description ? { description: input.description.trim() } : {}),
        }),
      })
    );
  }

  static async update(id: string, input: Partial<CouponInput>): Promise<Coupon> {
    return toCoupon(
      await apiFetch<any>(`/coupons/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(input.code !== undefined ? { code: input.code.trim() } : {}),
          ...(input.mode !== undefined ? { mode: input.mode } : {}),
          ...(input.value !== undefined ? { value: input.value.toFixed(4) } : {}),
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
          ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        }),
      })
    );
  }

  static async remove(id: string): Promise<void> {
    await apiFetch(`/coupons/${id}/`, { method: "DELETE" });
  }

  /**
   * Ask what a code is worth against this bill.
   *
   * `payable` is required because a percentage coupon is worth more on a
   * bigger basket — an answer without it would be a number the cashier could
   * not check against the screen.
   */
  static async check(code: string, payable: number): Promise<CouponCheck> {
    const row = await apiFetch<any>("/coupons/check/", {
      method: "POST",
      body: JSON.stringify({ code: code.trim(), payable: payable.toFixed(4) }),
    });
    return {
      code: String(row?.code ?? ""),
      mode: String(row?.mode ?? "PERCENT").toUpperCase() === "FLAT" ? "FLAT" : "PERCENT",
      value: toAmount(row?.value),
      discount: toAmount(row?.discount),
      description: String(row?.description ?? ""),
    };
  }
}
