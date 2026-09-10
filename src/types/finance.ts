/**
 * The Income & Expense screen's shapes.
 *
 * Money arrives as strings from the API — `DecimalAsStringJSONEncoder` sends
 * every decimal that way so nothing is rounded in transit — and becomes
 * `number` here at the boundary, once, rather than being parsed at each of the
 * dozen places the screen displays a figure.
 */

/** Which side of the books a row is on. The sign is the type, never the amount. */
export type LedgerType = "INCOME" | "EXPENSE";

/**
 * Where a row came from, and therefore whether this screen owns it.
 *
 * `MANUAL` is an entry somebody typed here and may amend here. `SALE` and
 * `SALE_RETURN` are the till's own documents — this screen REPORTS them so the
 * income side is the shop's real money, and offering Edit on one would be
 * offering to rewrite an invoice from a summary page.
 */
export type LedgerSource = "MANUAL" | "SALE" | "SALE_RETURN";

/** One entry in the transactions list. */
export interface LedgerEntry {
  id: string;
  type: LedgerType;
  source: LedgerSource;
  /** ISO date, as stored — formatted for display at the point of use. */
  date: string;
  categoryId: string | null;
  categoryName: string;
  description: string;
  referenceNo: string;
  branchId: string | null;
  branchName: string;
  /** Always positive. `type` says which way it goes. */
  amount: number;
  /** The same figure with its sign, for anything that sums the list. */
  signedAmount: number;
}

/** The four cards at the top. */
export interface LedgerTotals {
  income: number;
  expense: number;
  net: number;
  transactions: number;
  /** Of what came in, how much stayed. Zero when nothing came in. */
  marginPercent: number;
}

/** One bar pair on the trend chart. Twelve of these, always. */
export interface TrendPoint {
  month: number;
  label: string;
  income: number;
  expense: number;
}

/** One row of the yearly matrix: a category across twelve months. */
export interface MatrixRow {
  categoryId: string;
  categoryName: string;
  /** Twelve cells, Jan first. A month with nothing in it is 0, not missing. */
  months: number[];
  total: number;
}

export interface LedgerSummary {
  year: number;
  month: number | null;
  totals: LedgerTotals;
  trend: TrendPoint[];
  matrix: {
    income: MatrixRow[];
    expense: MatrixRow[];
    net: { months: number[]; total: number };
  };
}

/** What the Add / Edit dialog sends. */
export interface LedgerEntryInput {
  type: LedgerType;
  categoryId: string;
  amount: number;
  date: string;
  description: string;
  referenceNo?: string;
  branchId?: string | null;
}

/** A category on one side of the books. */
export interface LedgerCategory {
  id: string;
  name: string;
}
