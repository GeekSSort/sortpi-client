import { apiFetch, apiList, toAmount } from "./apiClient";
import type {
  LedgerType,
  MoneyAccount,
  Voucher,
  VoucherFilter,
  VoucherInput,
  VoucherTotals,
} from "@/types/finance";

/**
 * Vouchers — the shop's money in and out, as numbered documents.
 *
 * The server has no voucher table and this service does not pretend otherwise:
 * `/vouchers/` is a second shape over the same `Income` and `Expense` rows the
 * Income & Expense screen reads. That is what keeps the two screens agreeing —
 * a voucher cannot be counted here and missed there, because it is the same
 * row.
 *
 * Categories are the ordinary income/expense categories, so they are managed
 * through `FinanceService` rather than duplicated here.
 */

/** `snakeToCamelCase` rewrites every key, so both spellings are read. */
function pick<T = unknown>(row: any, ...names: string[]): T | undefined {
  for (const name of names) {
    if (row?.[name] !== undefined) return row[name] as T;
  }
  return undefined;
}

function toVoucher(row: any): Voucher {
  const amount = toAmount(row?.amount);
  const signed = pick<string | number>(row, "signedAmount", "signed_amount");
  const type = String(row?.type ?? "EXPENSE").toUpperCase() as LedgerType;
  return {
    id: String(row?.id ?? ""),
    type,
    voucherNo: String(pick(row, "voucherNo", "voucher_no") ?? ""),
    date: String(row?.date ?? ""),
    categoryId: (pick<string>(row, "categoryId", "category_id") as string) ?? null,
    categoryName: String(pick(row, "categoryName", "category_name") ?? ""),
    description: String(row?.description ?? ""),
    amount,
    // Derived from the type when the server did not send it, rather than left
    // at zero: a row whose sign silently became 0 would drop out of every
    // total computed from this list without changing the row on screen.
    signedAmount:
      signed === undefined ? (type === "INCOME" ? amount : -amount) : toAmount(signed),
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

/** The filter, as the query string both endpoints take. */
function queryOf(filter: VoucherFilter): URLSearchParams {
  const query = new URLSearchParams();
  if (filter.type) query.set("type", filter.type);
  if (filter.categoryId) query.set("category", filter.categoryId);
  if (filter.search?.trim()) query.set("search", filter.search.trim());
  if (filter.dateFrom) query.set("date_from", filter.dateFrom);
  if (filter.dateTo) query.set("date_to", filter.dateTo);
  if (filter.branchId) query.set("branch", filter.branchId);
  return query;
}

export class VoucherService {
  /** A page of vouchers, both sides interleaved and newest first. */
  static async list(
    filter: VoucherFilter & { page?: number; limit?: number }
  ): Promise<{ data: Voucher[]; total: number }> {
    const query = queryOf(filter);
    query.set("page", String(filter.page ?? 1));
    query.set("limit", String(filter.limit ?? 25));

    const rows = await apiList<any>(`/vouchers/?${query}`, { method: "GET" }, (r) => r);
    return { data: (rows.data || []).map(toVoucher), total: rows.total };
  }

  /**
   * The four cards, over the SAME filter as the list.
   *
   * A second request rather than a total computed from the rows on screen: the
   * list is paged, so summing what arrived would report the page and label it
   * the period.
   */
  static async totals(filter: VoucherFilter): Promise<VoucherTotals> {
    const row = await apiFetch<any>(`/vouchers/summary/?${queryOf(filter)}`, {
      method: "GET",
    });
    return {
      count: Number(row?.count ?? 0),
      income: toAmount(row?.income),
      expense: toAmount(row?.expense),
      net: toAmount(row?.net),
    };
  }

  /** Write a voucher. Returns it, numbered, ready to print. */
  static async create(input: VoucherInput): Promise<Voucher> {
    const row = await apiFetch<any>("/vouchers/", {
      method: "POST",
      body: JSON.stringify({
        type: input.type,
        category: input.categoryId,
        // Four decimals, as a STRING. A JSON number would be a float, and a
        // float touching a money value is a defect in this codebase.
        amount: input.amount.toFixed(4),
        date: input.date,
        description: input.description,
        ...(input.paymentAccountId ? { payment_account: input.paymentAccountId } : {}),
        ...(input.branchId ? { branch: input.branchId } : {}),
      }),
    });
    return toVoucher(row);
  }

  /** Void one — the ledger rows behind it are reversed, then it is removed. */
  static async remove(id: string): Promise<void> {
    await apiFetch(`/vouchers/${id}/`, { method: "DELETE" });
  }

  /**
   * The cash and bank accounts a voucher can be settled through.
   *
   * ASSETs only: an expense is paid out of something the shop HAS. Offering
   * the whole chart of accounts here would invite somebody to pay the rent out
   * of "Sales Revenue", which posts a balanced pair of entries that mean
   * nothing.
   */
  static async moneyAccounts(): Promise<MoneyAccount[]> {
    const rows = await apiList<any>("/accounts/?limit=200", { method: "GET" }, (r) => r);
    return (rows.data || [])
      .filter(
        (a: any) =>
          String(pick(a, "accountType", "account_type")).toUpperCase() === "ASSET" &&
          (pick<boolean>(a, "isActive", "is_active") ?? true)
      )
      .map((a: any) => ({
        id: String(a?.id ?? ""),
        code: String(a?.code ?? ""),
        name: String(a?.name ?? ""),
      }))
      // By code, so the drawer (1100) comes before the bank and the order is
      // the chart's rather than whatever the API returned first.
      .sort((a: MoneyAccount, b: MoneyAccount) => a.code.localeCompare(b.code));
  }
}
