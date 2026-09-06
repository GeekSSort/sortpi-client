export interface PurchaseRecord {
  id: string;
  purchaseId: string;
  supplier: {
    name: string;
    avatar: string;
  };
  purchaseDate: string;
  itemsCount: number;
  totalAmount: number;
  totalAmountFormatted: string;
  /** What the supplier has been paid so far. The API calls it `paid_amount`;
      on this screen it is what they have RECEIVED. */
  paidAmount: number;
  paidAmountFormatted: string;
  /** Still owed. The API keeps it on the row rather than deriving it, because
      a return can change it without the total moving. */
  dueAmount: number;
  dueAmountFormatted: string;
  paymentStatus: "Paid" | "Due" | "Partial";
  status: "Received" | "Pending" | "Ordered" | "Cancelled";
  /** The API's own status, unmapped. The four labels above collapse DRAFT and
      PARTIAL into "Pending", and only a DRAFT may be edited — so the screen
      cannot decide that from the label it shows. */
  rawStatus: "DRAFT" | "CONFIRMED" | "PARTIAL" | "RECEIVED" | "CANCELLED" | string;
  supplierId: string;
}

export interface PurchaseQueryFilter {
  search?: string;
  status?: string;
  paymentStatus?: string;
  supplier?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

