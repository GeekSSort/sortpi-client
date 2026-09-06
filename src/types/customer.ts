export interface CustomerRecord {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  /** Shown by the POS Reports table; absent on older records. */
  email?: string;
  type: "Regular" | "VIP" | "Premium";
  orderCount: number;
  totalSpent: number;
  totalSpentFormatted: string;
  dueAmount: number;
  dueAmountFormatted: string;
  status: "Active" | "Inactive";
}

export interface CustomerQueryFilter {
  search?: string;
  /** "Active" narrows to active customers; the API has no inactive-only filter. */
  status?: string;
  /** The API's own two kinds: RETAIL or WHOLESALE. */
  customerType?: "RETAIL" | "WHOLESALE";
  page?: number;
  limit?: number;
}

export interface CreateCustomerPayload {
  name: string;
  phone: string;
  /** Shown by the POS Reports table; absent on older records. */
  email?: string;
  type: "Regular" | "VIP" | "Premium";
  status?: "Active" | "Inactive";
}

