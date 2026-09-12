export interface SalesOverviewItem {
  id: string;
  invoiceNo: string;
  dateTime: string;
  customer: string;
  totalAmount: number;
  totalAmountFormatted: string;
  /** What was taken against the invoice, and what is still owed. The panel's
      own figures are sums of these — see `SalesOverviewModal`. */
  paidAmount: number;
  paidAmountFormatted: string;
  dueAmount: number;
  dueAmountFormatted: string;
  /** The four the design names, and whatever else the shop takes: the API's
      `payment_provider` is free text, which is why SaleRecord is widened the
      same way. Closed, this type could not be assigned the record it is
      mapped from and a production build failed on it. */
  paymentMethod: "Cash" | "bKash" | "Card" | "Bank Transfer" | string;
  /** Three states, as the sales list has. Collapsing Partial into Unpaid here
      made a half-settled invoice indistinguishable from one nobody had paid
      a paisa towards. */
  status: "Paid" | "Partial" | "Unpaid";
}

export interface OrderListItem {
  id: string;
  purchaseId: string;
  supplier: {
    name: string;
    avatarUrl?: string;
  };
  purchaseDate: string;
  items: number;
  totalAmount: number;
  totalAmountFormatted: string;
  paymentStatus: "Paid" | "Due";
  status: "Received" | "Pending";
}

export interface CustomerListItem {
  id: string;
  customerId: string;
  customer: string;
  phone: string;
  type: "Regular" | "VIP" | "Premium";
  order: number;
  totalSpent: number;
  totalSpentFormatted: string;
  due: number;
  dueFormatted: string;
  status: "Active" | "Inactive";
}

export type OverviewModalType = "sales" | "orders" | "customers" | "revenue" | null;

