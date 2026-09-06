import { SalesOverviewItem, OrderListItem, CustomerListItem } from "@/types/overview";
import { apiList } from "./apiClient";
import {
  toCustomerListItem,
  toOrderListItem,
  toSalesOverviewItem,
} from "./mappers/overview";

/**
 * The dashboard's pop-out panels.
 *
 * There is no `/ceo-overview/...` on the server, and there does not need to
 * be: a panel of recent sales wants the sales list, not a second endpoint
 * returning the same rows under another name.
 *
 * Small pages on purpose. These are for a quick look, not for reporting.
 */

const PANEL_SIZE = 25;

export class OverviewService {
  /** Recent sales, newest first. */
  static async getSalesOverview(): Promise<SalesOverviewItem[]> {
    const res = await apiList<SalesOverviewItem>(
      `/sales/?limit=${PANEL_SIZE}`,
      { method: "GET" },
      undefined,
      toSalesOverviewItem
    );
    return res.data;
  }

  /** Purchase orders — what the "Total Orders" card counts. */
  static async getOrders(): Promise<OrderListItem[]> {
    const res = await apiList<OrderListItem>(
      `/purchases/?limit=${PANEL_SIZE}`,
      { method: "GET" },
      undefined,
      toOrderListItem
    );
    return res.data;
  }

  static async getCustomers(): Promise<CustomerListItem[]> {
    const res = await apiList<CustomerListItem>(
      `/customers/?limit=${PANEL_SIZE}`,
      { method: "GET" },
      undefined,
      toCustomerListItem
    );
    return res.data;
  }
}
