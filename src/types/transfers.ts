/** One product on a transfer note, as the API returns it. */
export interface TransferLine {
  id: string;
  name: string;
  /** WHICH variant is moving — "500ml". Empty for a one-variant product. */
  variantLabel: string;
  sku: string;
  quantity: number;
  /** What actually arrived. 0 until the transfer is received, and less than
      `quantity` when the delivery was short. */
  receivedQuantity: number;
}

export interface TransferRecord {
  id: string;
  transferId: string;
  fromLocation: string;
  toLocation: string;
  productsSummary: string;
  quantity: number;
  /** Every line, for the detail dialog. The table shows a summary of them. */
  lines: TransferLine[];
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
