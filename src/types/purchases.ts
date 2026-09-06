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
  paymentStatus: "Paid" | "Due" | "Partial";
  status: "Received" | "Pending" | "Ordered" | "Cancelled";
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

