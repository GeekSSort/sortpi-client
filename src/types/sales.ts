export interface SaleRecord {
  id: string;
  invoiceNo: string;
  dateTime: string;
  customerName: string;
  totalAmount: number;
  totalAmountFormatted: string;
  paymentMethod: "Cash" | "bKash" | "Card" | "Bank Transfer" | string;
  status: "Paid" | "Unpaid" | "Pending" | "Refunded";
  referenceNo?: string;
  transactionId?: string;
}

export interface SalesQueryFilter {
  search?: string;
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  status?: string;
  page?: number;
  limit?: number;
}

