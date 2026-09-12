export interface SaleRecord {
  id: string;
  invoiceNo: string;
  dateTime: string;
  customerName: string;
  totalAmount: number;
  totalAmountFormatted: string;
  /**
   * What has actually been taken against this sale, and what is still owed.
   *
   * Carried on the LIST row, not just on the detail: "which of these did the
   * customer only half pay, and by how much" is a question about the table,
   * and answering it meant opening every invoice one at a time. `status`
   * already says Partial — these say how partial.
   */
  paidAmount: number;
  paidAmountFormatted: string;
  dueAmount: number;
  dueAmountFormatted: string;
  paymentMethod: "Cash" | "bKash" | "Card" | "Bank Transfer" | string;
  /**
   * What this invoice IS, in one word.
   *
   * The first four are about money owed. The last two are about goods that
   * came back — a different question, and one the list could not answer at
   * all: a sale whose every item had been returned read "Paid", because a
   * return does not touch `Sale.status` and the only thing the row called
   * Refunded was a CANCELLED sale.
   */
  status:
    | "Paid"
    | "Partial"
    | "Unpaid"
    | "Pending"
    | "Refunded"
    | "Partially Refunded";
  referenceNo?: string;
  transactionId?: string;
}

export interface SalesQueryFilter {
  search?: string;
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  /** The DOCUMENT's state: COMPLETED or CANCELLED. */
  status?: string;
  /** What the Status column shows: paid, unpaid or refunded. */
  paymentStatus?: string;
  page?: number;
  limit?: number;
}

