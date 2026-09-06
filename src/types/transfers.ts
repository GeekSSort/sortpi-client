export interface TransferRecord {
  id: string;
  transferId: string;
  fromLocation: string;
  toLocation: string;
  productsSummary: string;
  quantity: number;
  dateTime: string;
  /** The API's four, not the stock screen's — those were copied in by mistake. */
  status: "Draft" | "Dispatched" | "Received" | "Cancelled";
}

export interface TransferQueryFilter {
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}


/** What `POST /inventory/transfers/` needs. Ids, and quantities only. */
export interface CreateTransferPayload {
  referenceNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  note?: string;
  items: { variantId: string; quantity: number }[];
}
