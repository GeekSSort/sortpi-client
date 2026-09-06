export interface ReturnRecord {
  id: string;
  returnNo: string;
  invoiceNo: string;
  dateTime: string;
  customerName: string;
  totalAmount: number;
  totalAmountFormatted: string;
  refundAmount: number;
  refundAmountFormatted: string;
  paymentMethod: "Cash" | "bKash" | "Card" | "Bank Transfer";
  status: "Paid" | "Unpaid" | "Pending" | "Rejected";
}

export interface ReturnQueryFilter {
  search?: string;
  status?: string;
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
  unitPrice: number;
}

/** The sale a return is being written against. */
export interface ReturnableSale {
  id: string;
  invoiceNo: string;
  customerName: string;
  saleDate: string;
  grandTotal: number;
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

