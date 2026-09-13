import { apiFetch, apiList, toAmount } from "./apiClient";
import { invalidate } from "@/lib/query/useQuery";
import type {
  Frequency,
  LedgerType,
  RegularPayment,
  RegularPaymentInput,
  RegularPaymentRun,
  RegularPaymentTotals,
  RunStatus,
  ScheduleState,
  Voucher,
} from "@/types/finance";

/**
 * Regular payments — rent, salaries, the internet bill, a loan instalment.
 *
 * A schedule is a TEMPLATE and paying one writes a VOUCHER, so `pay` returns a
 * `Voucher` and not a schedule: the slip is what somebody wants next, and the
 * list refreshes behind it.
 *
 * Every figure is a string on the wire and a number here, converted once at
 * this boundary.
 */

/** `snakeToCamelCase` rewrites every key, so both spellings are read. */
function pick<T = unknown>(row: any, ...names: string[]): T | undefined {
  for (const name of names) {
    if (row?.[name] !== undefined) return row[name] as T;
  }
  return undefined;
}

function toSchedule(row: any): RegularPayment {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    kind: String(row?.kind ?? "EXPENSE").toUpperCase() as LedgerType,
    categoryId: (pick<string>(row, "categoryId", "category_id") as string) ?? null,
    categoryName: String(pick(row, "categoryName", "category_name") ?? ""),
    amount: toAmount(row?.amount),
    frequency: String(row?.frequency ?? "MONTHLY").toUpperCase() as Frequency,
    startDate: String(pick(row, "startDate", "start_date") ?? ""),
    nextDueDate: String(pick(row, "nextDueDate", "next_due_date") ?? ""),
    endDate: (pick<string>(row, "endDate", "end_date") as string) ?? null,
    lastPaidOn: (pick<string>(row, "lastPaidOn", "last_paid_on") as string) ?? null,
    // UPCOMING when the server did not say, rather than OVERDUE: a schedule
    // wrongly shown as late sends somebody looking for a payment that is not
    // owed, which is the louder of the two wrong answers.
    state: String(row?.state ?? "UPCOMING").toUpperCase() as ScheduleState,
    daysUntilDue: Number(pick(row, "daysUntilDue", "days_until_due") ?? 0),
    isActive: Boolean(pick(row, "isActive", "is_active") ?? true),
    notes: String(row?.notes ?? ""),
    branchId: (pick<string>(row, "branchId", "branch_id") as string) ?? null,
    branchName: String(pick(row, "branchName", "branch_name") ?? ""),
    paymentAccountId:
      (pick<string>(row, "paymentAccountId", "payment_account_id") as string) ?? null,
    paymentAccountName: String(
      pick(row, "paymentAccountName", "payment_account_name") ?? "Cash"
    ),
    monthlyEquivalent: toAmount(pick(row, "monthlyEquivalent", "monthly_equivalent")),
    paidCount: Number(pick(row, "paidCount", "paid_count") ?? 0),
  };
}

function bodyOf(input: Partial<RegularPaymentInput>): string {
  return JSON.stringify({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.categoryId !== undefined ? { category: input.categoryId } : {}),
    // Four decimals, as a STRING. A JSON number would be a float.
    ...(input.amount !== undefined ? { amount: input.amount.toFixed(4) } : {}),
    ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
    ...(input.startDate !== undefined ? { start_date: input.startDate } : {}),
    // `null` is meaningful here and is NOT the same as absent: it CLEARS the
    // end date, which is how a schedule that was going to stop is made
    // open-ended again.
    ...(input.endDate !== undefined ? { end_date: input.endDate || null } : {}),
    ...(input.paymentAccountId !== undefined
      ? { payment_account: input.paymentAccountId || null }
      : {}),
    ...(input.branchId !== undefined ? { branch: input.branchId || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
}

export class RegularPaymentService {
  /** Every schedule, soonest due first — what is late, then what is next. */
  static async list(params: {
    kind?: LedgerType | "";
    state?: ScheduleState | "";
    search?: string;
    branchId?: string | null;
    page?: number;
    limit?: number;
  }): Promise<{ data: RegularPayment[]; total: number }> {
    const query = new URLSearchParams();
    if (params.kind) query.set("kind", params.kind);
    if (params.state) query.set("state", params.state);
    if (params.search?.trim()) query.set("search", params.search.trim());
    if (params.branchId) query.set("branch", params.branchId);
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 25));

    const rows = await apiList<any>(
      `/regular-payments/?${query}`,
      { method: "GET" },
      (r) => r
    );
    return { data: (rows.data || []).map(toSchedule), total: rows.total };
  }

  /** The cards, over the same filter as the list. */
  static async totals(params: {
    kind?: LedgerType | "";
    search?: string;
    branchId?: string | null;
  }): Promise<RegularPaymentTotals> {
    const query = new URLSearchParams();
    if (params.kind) query.set("kind", params.kind);
    if (params.search?.trim()) query.set("search", params.search.trim());
    if (params.branchId) query.set("branch", params.branchId);

    const row = await apiFetch<any>(`/regular-payments/summary/?${query}`, {
      method: "GET",
    });
    return {
      active: Number(row?.active ?? 0),
      dueSoon: Number(pick(row, "dueSoon", "due_soon") ?? 0),
      overdue: Number(row?.overdue ?? 0),
      monthlyOut: toAmount(pick(row, "monthlyOut", "monthly_out")),
      monthlyIn: toAmount(pick(row, "monthlyIn", "monthly_in")),
    };
  }

  static async create(input: RegularPaymentInput): Promise<RegularPayment> {
    const row = await apiFetch<any>("/regular-payments/", {
      method: "POST",
      body: bodyOf(input),
    });
    return toSchedule(row);
  }

  /** Amend a schedule. Vouchers already written are untouched. */
  static async update(
    id: string,
    input: Partial<RegularPaymentInput> & { isActive?: boolean }
  ): Promise<RegularPayment> {
    const body = JSON.parse(bodyOf(input));
    if (input.isActive !== undefined) body.is_active = input.isActive;
    const row = await apiFetch<any>(`/regular-payments/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return toSchedule(row);
  }

  /**
   * Pay the instalment that is due.
   *
   * Returns the VOUCHER — numbered, ready to print. Paying from this screen
   * rather than the voucher one saves filling the figures in; it would be a
   * strange saving to then make somebody go and find the slip.
   */
  static async pay(
    id: string,
    options: { paidOn?: string; amount?: number } = {}
  ): Promise<Voucher> {
    const row = await apiFetch<any>(`/regular-payments/${id}/pay/`, {
      method: "POST",
      body: JSON.stringify({
        ...(options.paidOn ? { paid_on: options.paidOn } : {}),
        ...(options.amount !== undefined ? { amount: options.amount.toFixed(4) } : {}),
      }),
    });
    return {
      id: String(row?.id ?? ""),
      type: String(row?.type ?? "EXPENSE").toUpperCase() as LedgerType,
      voucherNo: String(pick(row, "voucherNo", "voucher_no") ?? ""),
      date: String(row?.date ?? ""),
      categoryId: (pick<string>(row, "categoryId", "category_id") as string) ?? null,
      categoryName: String(pick(row, "categoryName", "category_name") ?? ""),
      description: String(row?.description ?? ""),
      amount: toAmount(row?.amount),
      signedAmount: toAmount(pick(row, "signedAmount", "signed_amount")),
      branchId: (pick<string>(row, "branchId", "branch_id") as string) ?? null,
      branchName: String(pick(row, "branchName", "branch_name") ?? ""),
      paymentAccountId:
        (pick<string>(row, "paymentAccountId", "payment_account_id") as string) ?? null,
      paymentAccountName: String(
        pick(row, "paymentAccountName", "payment_account_name") ?? "Cash"
      ),
      createdAt: String(pick(row, "createdAt", "created_at") ?? ""),
    };
  }

  /**
   * Record this instalment as NOT paid, and move past it.
   *
   * The "No, not paid" answer. It writes an occurrence with `NOT_PAID` status
   * and NO voucher — no ledger entry, no account movement, nothing any report
   * counts as an expense. The schedule moves to its next date under the same
   * rules paying it would use, so the prompt does not come back for an
   * instalment that has been answered.
   */
  static async skip(id: string): Promise<RegularPayment> {
    const row = await apiFetch<any>(`/regular-payments/${id}/skip/`, { method: "POST" });
    // Nothing moved, but the occurrence and the schedule's next date did.
    invalidate("regular-payments");
    return toSchedule(row);
  }

  /** Every instalment that came due against one schedule, paid or not. */
  static async runs(id: string): Promise<RegularPaymentRun[]> {
    const rows = await apiFetch<any[]>(`/regular-payments/${id}/runs/`, { method: "GET" });
    return (Array.isArray(rows) ? rows : []).map((row: any) => {
      const paidOn = pick<string>(row, "paidOn", "paid_on");
      return {
        id: String(row?.id ?? ""),
        dueDate: String(pick(row, "dueDate", "due_date") ?? ""),
        // A row written before the column existed was, by definition, a
        // payment — nothing else could write one.
        status: (String(row?.status ?? "PAID").toUpperCase() === "NOT_PAID"
          ? "NOT_PAID"
          : "PAID") as RunStatus,
        paidOn: paidOn ? String(paidOn) : null,
        amount: toAmount(row?.amount),
        voucherId: (pick<string>(row, "voucherId", "voucher_id") as string) ?? null,
        voucherNo: String(pick(row, "voucherNo", "voucher_no") ?? ""),
      };
    });
  }

  /** Remove a schedule. The vouchers it produced are untouched. */
  static async remove(id: string): Promise<void> {
    await apiFetch(`/regular-payments/${id}/`, { method: "DELETE" });
  }
}
