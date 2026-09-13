/** A line that came back, and so a line that was put back on the shelf. */
export interface ReturnedLine {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  lineTotalFormatted: string;
}

export interface ReturnRecord {
  id: string;
  returnNo: string;
  invoiceNo: string;
  dateTime: string;
  customerName: string;
  /** Blank for a walk-in. Printed under the name on the refund slip. */
  customerPhone: string;
  totalAmount: number;
  totalAmountFormatted: string;
  refundAmount: number;
  refundAmountFormatted: string;
  paymentMethod: "Cash" | "bKash" | "Card" | "Bank Transfer";
  status: "Paid" | "Unpaid" | "Pending" | "Rejected";
  /** What was restocked. Empty only if the server sent no lines. */
  items: ReturnedLine[];
}

export interface ReturnQueryFilter {
  search?: string;
  /**
   * How the money went back — CASH, CARD, MOBILE, BANK.
   *
   * This replaced a `status` filter. The list is confirmed refunds only now
   * (a withdrawn one did not happen), so every row shares one status and there
   * is nothing left for such a filter to narrow.
   */
  refundMethod?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

/** A line of the original sale, and how much of it may still come back. */
export interface ReturnableLine {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  /** Sold minus already returned — the server's figure, not ours. */
  returnable: number;
  /** The SHELF price. What the line is listed at, before any discount. */
  unitPrice: number;
  /**
   * What the customer was actually CHARGED for this line.
   *
   * Net of the line's own offer and of its share of any invoice discount,
   * which the pricing engine spreads across every line in proportion — and
   * this, not `unitPrice`, is what a refund gives back. A screen that totalled
   * the shelf price promised more than the shop hands over: ten at 100 with a
   * 200 discount took 800 and would have been quoted a 1,000 refund.
   */
  lineTotal: number;
  /**
   * What the customer actually PAID for the line, once the coupon, the points
   * and any whole-taka rounding had come off the bill — the server's figure,
   * and the one a refund is priced on.
   *
   * `lineTotal` never hears about those three, because they happen to the bill
   * after the lines are priced: a ৳1,000 sale with a 10% coupon took ৳900, and
   * a screen quoting `lineTotal` promised ৳1,000 back.
   */
  chargedTotal: number;
}

/** The sale a return is being written against. */
export interface ReturnableSale {
  id: string;
  invoiceNo: string;
  customerName: string;
  saleDate: string;
  grandTotal: number;
  /**
   * What has actually been RECEIVED against this invoice, and what is still
   * owed. Both are the server's ledger-derived figures.
   *
   * A refund gives back money the customer paid — never the sale total. On a
   * ৳1,000 sale settled with ৳600, returning everything hands over ৳600 and
   * clears the ৳400 that was never paid; quoting ৳1,000 would have the shop
   * paying ৳400 for the privilege of taking its own goods back.
   */
  settledAmount: number;
  outstandingAmount: number;
  items: ReturnableLine[];
}

/**
 * What `POST /sales/{id}/returns/` needs. No amount: the server refunds at the
 * price stamped on the original line, so a caller cannot name its own figure.
 */
export interface CreateReturnPayload {
  referenceNo: string;
  /** YYYY-MM-DD. */
  returnDate: string;
  refundMethod: "CASH" | "CARD" | "MOBILE" | "BANK";
  reason?: string;
  items: { saleItemId: string; quantity: number }[];
}

