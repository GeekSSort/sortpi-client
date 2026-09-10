import { apiFetch, apiList, toAmount } from "./apiClient";
import type {
  LedgerCategory,
  LedgerEntry,
  LedgerEntryInput,
  LedgerSource,
  LedgerSummary,
  LedgerType,
  MatrixRow,
  TrendPoint,
} from "@/types/finance";

/**
 * What the shop took and what it spent.
 *
 * Two tables on the server, one screen here. `Income` and `Expense` are
 * separate resources — they have different categories, different accounts and
 * different ledger signs — but the screen reads them together, so the two
 * aggregate endpoints answer for both at once and only the WRITES are split.
 *
 * Every figure is a string on the wire and a number here. `toAmount` is the
 * one place that conversion happens, so a `"1500.0000"` never reaches a
 * component that would render it verbatim or add it to another string.
 */

/** `snakeToCamelCase` rewrites every key, so both spellings are read. */
function pick<T = unknown>(row: any, ...names: string[]): T | undefined {
  for (const name of names) {
    if (row?.[name] !== undefined) return row[name] as T;
  }
  return undefined;
}

function toEntry(row: any): LedgerEntry {
  const amount = toAmount(row?.amount);
  const signed = pick<string | number>(row, "signedAmount", "signed_amount");
  return {
    id: String(row?.id ?? ""),
    type: (String(row?.type ?? "EXPENSE").toUpperCase() as LedgerType) satisfies LedgerType,
    // Defaults to MANUAL only when the server did not say. A row wrongly
    // marked manual offers an Edit the API refuses; one wrongly marked SALE
    // hides an edit that would work — the first is the louder failure, so the
    // fallback is the one that fails loudly rather than silently.
    source: (String(row?.source ?? "MANUAL").toUpperCase() as LedgerSource),
    date: String(row?.date ?? ""),
    categoryId: (pick<string>(row, "categoryId", "category_id") as string) ?? null,
    categoryName: String(pick(row, "categoryName", "category_name") ?? ""),
    description: String(row?.description ?? ""),
    referenceNo: String(pick(row, "referenceNo", "reference_no") ?? ""),
    branchId: (pick<string>(row, "branchId", "branch_id") as string) ?? null,
    branchName: String(pick(row, "branchName", "branch_name") ?? ""),
    amount,
    // Derived from the type when the server did not send it, rather than left
    // at zero: a row whose sign silently became 0 would drop out of every
    // total computed from this list without changing the row on screen.
    signedAmount:
      signed === undefined
        ? (String(row?.type).toUpperCase() === "INCOME" ? amount : -amount)
        : toAmount(signed),
  };
}

function toMatrixRow(row: any): MatrixRow {
  const months = Array.isArray(row?.months) ? row.months : [];
  return {
    categoryId: String(pick(row, "categoryId", "category_id") ?? ""),
    categoryName: String(pick(row, "categoryName", "category_name") ?? "—"),
    // Padded to twelve here as well as on the server. The matrix renders a
    // fixed twelve columns and reads `months[i]` for each; a short array would
    // render `undefined` into the last cells of the row.
    months: Array.from({ length: 12 }, (_, i) => toAmount(months[i])),
    total: toAmount(row?.total),
  };
}

export class FinanceService {
  /** Totals, the twelve-month trend, and the yearly matrix — one request. */
  static async summary(params: {
    year: number;
    month?: number | null;
    branchId?: string | null;
  }): Promise<LedgerSummary> {
    const query = new URLSearchParams({ year: String(params.year) });
    if (params.month) query.set("month", String(params.month));
    if (params.branchId) query.set("branch", params.branchId);

    const row = await apiFetch<any>(`/income-expense/summary/?${query}`, { method: "GET" });
    const totals = row?.totals ?? {};
    const matrix = row?.matrix ?? {};
    const net = matrix?.net ?? {};
    const netMonths = Array.isArray(net?.months) ? net.months : [];

    return {
      year: Number(row?.year ?? params.year),
      month: row?.month ?? null,
      totals: {
        income: toAmount(totals?.income),
        expense: toAmount(totals?.expense),
        net: toAmount(totals?.net),
        transactions: Number(totals?.transactions ?? 0),
        marginPercent: toAmount(pick(totals, "marginPercent", "margin_percent")),
      },
      trend: (Array.isArray(row?.trend) ? row.trend : []).map(
        (t: any): TrendPoint => ({
          month: Number(t?.month ?? 0),
          label: String(t?.label ?? ""),
          income: toAmount(t?.income),
          expense: toAmount(t?.expense),
        })
      ),
      matrix: {
        income: (Array.isArray(matrix?.income) ? matrix.income : []).map(toMatrixRow),
        expense: (Array.isArray(matrix?.expense) ? matrix.expense : []).map(toMatrixRow),
        net: {
          months: Array.from({ length: 12 }, (_, i) => toAmount(netMonths[i])),
          total: toAmount(net?.total),
        },
      },
    };
  }

  /** A page of the entries list, both sides interleaved and newest first. */
  static async transactions(params: {
    year: number;
    month?: number | null;
    type?: LedgerType | "";
    search?: string;
    branchId?: string | null;
    page?: number;
    limit?: number;
  }): Promise<{ data: LedgerEntry[]; total: number }> {
    const query = new URLSearchParams({ year: String(params.year) });
    if (params.month) query.set("month", String(params.month));
    if (params.type) query.set("type", params.type);
    if (params.search?.trim()) query.set("search", params.search.trim());
    if (params.branchId) query.set("branch", params.branchId);
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 8));

    const rows = await apiList<any>(
      `/income-expense/transactions/?${query}`,
      { method: "GET" },
      (r) => r
    );
    return { data: (rows.data || []).map(toEntry), total: rows.total };
  }

  /** The categories one side of the books offers. */
  static async categories(type: LedgerType): Promise<LedgerCategory[]> {
    const path = type === "INCOME" ? "/income-categories/" : "/expense-categories/";
    const rows = await apiList<any>(`${path}?limit=200`, { method: "GET" }, (r) => r);
    return (rows.data || []).map((row: any) => ({
      id: String(row?.id ?? ""),
      name: String(row?.name ?? ""),
    }));
  }

  /**
   * Create a category on one side of the books.
   *
   * The dialog needs this because a shop starts with NONE on the income side.
   * Without it the Add dialog was a dead end: a required dropdown with nothing
   * in it, a sentence saying so, and no way forward — so income could not be
   * recorded at all until somebody went and made a category through the API.
   */
  static async createCategory(type: LedgerType, name: string): Promise<LedgerCategory> {
    const path = type === "INCOME" ? "/income-categories/" : "/expense-categories/";
    const row = await apiFetch<any>(path, {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    return { id: String(row?.id ?? ""), name: String(row?.name ?? name.trim()) };
  }

  /**
   * The default ledger account for one side.
   *
   * An entry needs one, and the screen does not ask for it — a shopkeeper
   * recording "Rent, 60,000" is not choosing a chart-of-accounts line. The
   * seeded defaults are the right answer: 4100 Sales Revenue for income and
   * 5200 for expenses, which is where `default_accounts` puts them anyway.
   */
  private static accountCache = new Map<LedgerType, Promise<string>>();

  static async defaultAccountId(type: LedgerType): Promise<string> {
    const cached = FinanceService.accountCache.get(type);
    if (cached) return cached;

    const wanted = type === "INCOME" ? "REVENUE" : "EXPENSE";
    const promise = apiList<any>("/accounts/?limit=200", { method: "GET" }, (r) => r)
      .then((rows) => {
        const list = rows.data || [];
        const match =
          list.find(
            (a: any) => String(pick(a, "accountType", "account_type")).toUpperCase() === wanted
          ) ?? list[0];
        return String(match?.id ?? "");
      })
      .catch((error) => {
        // Not cached on failure: the next attempt should ask again rather than
        // hand back an empty id for the rest of the session.
        FinanceService.accountCache.delete(type);
        throw error;
      });
    FinanceService.accountCache.set(type, promise);
    return promise;
  }

  static async create(input: LedgerEntryInput): Promise<void> {
    const path = input.type === "INCOME" ? "/incomes/" : "/expenses/";
    await apiFetch(path, {
      method: "POST",
      body: JSON.stringify({
        category: input.categoryId,
        account: await FinanceService.defaultAccountId(input.type),
        amount: input.amount.toFixed(4),
        date: input.date,
        description: input.description,
        ...(input.referenceNo ? { reference_no: input.referenceNo } : {}),
        ...(input.branchId ? { branch: input.branchId } : {}),
      }),
    });
  }

  /**
   * Amend an entry.
   *
   * The TYPE cannot change here, and that is deliberate rather than an
   * omission: income and expense are different tables with different
   * categories and opposite ledger signs, so "make this expense an income"
   * is a delete and a create, not a PATCH. The dialog offers the type only
   * when adding.
   */
  static async update(id: string, input: LedgerEntryInput): Promise<void> {
    const path = input.type === "INCOME" ? `/incomes/${id}/` : `/expenses/${id}/`;
    await apiFetch(path, {
      method: "PATCH",
      body: JSON.stringify({
        category: input.categoryId,
        amount: input.amount.toFixed(4),
        date: input.date,
        description: input.description,
        ...(input.referenceNo ? { reference_no: input.referenceNo } : {}),
      }),
    });
  }

  static async remove(entry: Pick<LedgerEntry, "id" | "type">): Promise<void> {
    const path = entry.type === "INCOME" ? `/incomes/${entry.id}/` : `/expenses/${entry.id}/`;
    await apiFetch(path, { method: "DELETE" });
  }
}
