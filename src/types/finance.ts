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

/**
 * A voucher — the same `Income` or `Expense` row, seen as a numbered document.
 *
 * Not a separate record and deliberately not a separate type hierarchy: a
 * voucher IS the entry, so anything that sums the books counts it once by
 * counting the entry. `voucherNo` is empty for a row that was written from the
 * Income & Expense screen, which has no numbering of its own — that row is
 * still one of the shop's vouchers, and hiding it would make this list a
 * partial view of the books presenting itself as the whole one.
 */
export interface Voucher {
  id: string;
  type: LedgerType;
  voucherNo: string;
  /** ISO date, as stored. Formatted at the point of use. */
  date: string;
  categoryId: string | null;
  categoryName: string;
  description: string;
  /** Always positive. `type` says which way it goes. */
  amount: number;
  /** The same figure with its sign, for anything that sums the list. */
  signedAmount: number;
  branchId: string | null;
  branchName: string;
  /** The drawer or the bank — where the money actually moved. */
  paymentAccountId: string | null;
  paymentAccountName: string;
  createdAt: string;
}

/** The four cards above the voucher list, over the SAME filter as the rows. */
export interface VoucherTotals {
  count: number;
  income: number;
  expense: number;
  net: number;
}

/** What the New Voucher dialog sends. */
export interface VoucherInput {
  type: LedgerType;
  categoryId: string;
  amount: number;
  date: string;
  description: string;
  paymentAccountId?: string | null;
  branchId?: string | null;
}

/** What the voucher list is narrowed by. Shared by the list and the cards. */
export interface VoucherFilter {
  type?: LedgerType | "";
  categoryId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  branchId?: string | null;
}

/** A cash or bank account a voucher can be settled through. */
export interface MoneyAccount {
  id: string;
  code: string;
  name: string;
}

/** How often a regular payment falls due. */
export type Frequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

/**
 * Where a schedule stands TODAY.
 *
 * Computed by the server from the current date, never stored: a stored status
 * is wrong the moment the clock passes midnight and nothing would be running
 * to correct it.
 */
export type ScheduleState = "OVERDUE" | "DUE" | "UPCOMING" | "PAUSED" | "ENDED";

/**
 * A regular payment — the money a shop knows is coming.
 *
 * A TEMPLATE and not a transaction. Nothing here is money: creating one posts
 * no ledger row and is counted by no report. Paying one writes an ordinary
 * voucher, which is the row every other screen already reads.
 */
export interface RegularPayment {
  id: string;
  name: string;
  kind: LedgerType;
  categoryId: string | null;
  categoryName: string;
  amount: number;
  frequency: Frequency;
  startDate: string;
  nextDueDate: string;
  endDate: string | null;
  lastPaidOn: string | null;
  state: ScheduleState;
  /** Negative means it is late. */
  daysUntilDue: number;
  isActive: boolean;
  notes: string;
  branchId: string | null;
  branchName: string;
  paymentAccountId: string | null;
  paymentAccountName: string;
  /** This schedule's share of a month, for the commitment card. */
  monthlyEquivalent: number;
  paidCount: number;
}

/** The cards above the regular-payments list. */
export interface RegularPaymentTotals {
  active: number;
  dueSoon: number;
  overdue: number;
  /** Every frequency normalised to a month — weekly counts 52/12, not 4. */
  monthlyOut: number;
  monthlyIn: number;
}

/** What the schedule dialog sends. */
export interface RegularPaymentInput {
  name: string;
  kind: LedgerType;
  categoryId: string;
  amount: number;
  frequency: Frequency;
  startDate: string;
  endDate?: string | null;
  paymentAccountId?: string | null;
  branchId?: string | null;
  notes?: string;
}

/** One instalment that was paid, and the voucher it produced. */
/**
 * What became of one instalment when its day came.
 *
 * PAID wrote a voucher and moved money. NOT_PAID wrote neither — it is the
 * record that the day arrived and the bill went unsettled, which used to leave
 * no trace at all: the schedule simply moved on to next month.
 */
export type RunStatus = "PAID" | "NOT_PAID";

export interface RegularPaymentRun {
  id: string;
  dueDate: string;
  status: RunStatus;
  /** Null on a NOT_PAID run — it was not paid on any day. */
  paidOn: string | null;
  amount: number;
  /** Null on a NOT_PAID run. There is no money to point at. */
  voucherId: string | null;
  voucherNo: string;
}
