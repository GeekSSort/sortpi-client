import {
  DashboardResponse,
  MetricCardData,
  ProfitLossData,
  RecentActivityItem,
  SalesDataPoint,
} from "@/types/dashboard";
import { toAmount } from "../apiClient";
import { formatCount, formatMoney, formatMoneyCompact } from "@/lib/format";

/**
 * The dashboard reply -> what the screen shows.
 *
 * The server sends five summaries and no person, so the name comes from
 * whoever is signed in and the cards are built from the summaries.
 *
 * Recent Activities is the sales list, labelled as sales: the server has no
 * activity feed, and calling a sale something else would be misleading.
 */

function metrics(sales: any, purchases: any, pnl: any): MetricCardData[] {
  const revenue = toAmount(sales?.revenue);
  const saleCount = toAmount(sales?.saleCount);
  const orders = toAmount(purchases?.purchaseCount);
  const profit = toAmount(pnl?.netProfit);

  // No comparison period comes back yet, so the trend is left neutral rather
  // than invented. A made-up "+12%" on a real dashboard is worse than none.
  const flat = { trend: "—", trendType: "up" as const, vsText: "no comparison yet" };

  return [
    { id: "revenue", title: "Total Revenue", value: formatMoneyCompact(revenue), icon: "revenue", ...flat },
    { id: "sales", title: "Total Sales", value: formatCount(saleCount), icon: "sales", ...flat },
    { id: "orders", title: "Total Orders", value: formatCount(orders), icon: "orders", ...flat },
    { id: "customers", title: "Net Profit", value: formatMoneyCompact(profit), icon: "customers", ...flat },
  ];
}

function series(byDay: any): SalesDataPoint[] {
  if (!Array.isArray(byDay)) return [];
  return byDay.map((row: any) => ({
    date: String(row?.day ?? row?.date ?? ""),
    sales: toAmount(row?.revenue ?? row?.sales),
    orders: toAmount(row?.saleCount ?? row?.orders),
  }));
}

function profitLoss(pnl: any): ProfitLossData {
  const totalRevenue = toAmount(pnl?.revenue);
  const totalExpenses = toAmount(pnl?.expenses) + toAmount(pnl?.costOfGoods);
  const netProfit = toAmount(pnl?.netProfit);
  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    // Rounded here as well as at display: a component that forgets to format
    // should still not print sixteen decimal places.
    profitMargin:
      totalRevenue > 0 ? Number((((netProfit / totalRevenue) * 100)).toFixed(2)) : 0,
    revenueFormatted: formatMoney(totalRevenue),
    expensesFormatted: formatMoney(totalExpenses),
    netProfitFormatted: formatMoney(netProfit),
  };
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** One sale -> one line in Recent Activities. */
function activities(sales: any[]): RecentActivityItem[] {
  return (sales || []).map((row: any) => {
    const amount = toAmount(row?.grandTotal ?? row?.grand_total);
    const due = toAmount(row?.dueAmount ?? row?.due_amount);
    const at = new Date(String(row?.saleDate ?? row?.sale_date ?? ""));
    return {
      id: String(row?.id ?? ""),
      activity: "Sale",
      reference: String(row?.invoiceNumber ?? row?.invoice_number ?? "—"),
      dateTime: Number.isNaN(at.getTime()) ? "—" : WHEN.format(at),
      amount,
      amountFormatted: formatMoney(amount),
      // Paid in full is settled; anything left owing is still open.
      status: String(row?.status || "").toUpperCase() === "CANCELLED"
        ? "Cancelled"
        : due > 0
          ? "Pending"
          : "Delivered",
    };
  });
}

export function toDashboardResponse(
  payload: any,
  user: { name: string; email: string },
  recentSales: any[] = []
): DashboardResponse {
  const p = payload || {};
  return {
    user: { name: user.name, email: user.email },
    metrics: metrics(p.salesSummary, p.purchaseSummary, p.financePnl),
    salesSummary: series(p.salesByDay),
    profitLoss: profitLoss(p.financePnl),
    recentActivities: activities(recentSales),
  };
}
