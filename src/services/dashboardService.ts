import { DashboardResponse, MetricCardData, SalesDataPoint, RecentActivityItem } from "@/types/dashboard";
import { apiFetch, toAmount } from "./apiClient";
import { toDashboardResponse } from "./mappers/dashboard";
import { AuthService } from "./authService";

export class DashboardService {
  /**
   * Everything the dashboard shows, in one go.
   *
   * The branch goes in the query string. The server scopes reports on
   * `branch_id`, not on the branch stamped in the token, so without it every
   * branch showed the whole company's figures.
   */
  /**
   * Sales against returns for a window, for screens that need the pair rather
   * than the whole dashboard bundle.
   *
   * Reads the same endpoint and the same cache-friendly shape; the returns
   * page uses it to state what came back beside what went out, which is the
   * only way a reader can tell a quiet week from a refunded one.
   */
  static async getReturnsSummary(
    branchId?: string | null,
    range?: { fromDate?: string; toDate?: string }
  ): Promise<{
    grossRevenue: number;
    netRevenue: number;
    returnsTotal: number;
    returnCount: number;
  }> {
    const params = new URLSearchParams();
    if (branchId) params.set("branch_id", branchId);
    if (range?.fromDate) params.set("from_date", range.fromDate);
    if (range?.toDate) params.set("to_date", range.toDate);
    const qs = params.toString() ? `?${params.toString()}` : "";

    const payload = await apiFetch<any>(`/dashboard/${qs}`, { method: "GET" });
    const s = payload?.salesSummary ?? payload?.sales_summary ?? {};
    return {
      grossRevenue: toAmount(s.grossRevenue ?? s.gross_revenue ?? s.revenue),
      netRevenue: toAmount(s.revenue),
      returnsTotal: toAmount(s.returnsTotal ?? s.returns_total),
      returnCount: Number(s.returnCount ?? s.return_count ?? 0),
    };
  }

  static async getDashboardData(
    branchId?: string | null,
    range?: { fromDate?: string; toDate?: string }
  ): Promise<DashboardResponse> {
    // `from_date`/`to_date` are what the reports endpoint reads; without them
    // every card showed all of time no matter which range was picked.
    const params = new URLSearchParams();
    if (branchId) params.set("branch_id", branchId);
    if (range?.fromDate) params.set("from_date", range.fromDate);
    if (range?.toDate) params.set("to_date", range.toDate);
    const scope = params.toString() ? `?${params.toString()}` : "";

    const salesParams = new URLSearchParams({ limit: "8" });
    if (branchId) salesParams.set("branch_id", branchId);
    if (range?.fromDate) salesParams.set("date_from", range.fromDate);
    if (range?.toDate) salesParams.set("date_to", range.toDate);
    // The endpoint returns figures only: five summaries, no person and no
    // cards. The mapper builds the screen from them, and the greeting comes
    // from whoever is signed in.
    const [payload, user, sales] = await Promise.all([
      apiFetch<any>(`/dashboard/${scope}`, { method: "GET" }),
      AuthService.getCurrentUser().catch(() => ({ greeting: "there", email: "" })),
      // Recent Activities is the sales list: the server has no feed of its own.
      // It takes the SAME window, on `date_from`/`date_to` rather than the
      // reports endpoint's `from_date`/`to_date` — two different spellings for
      // the same idea, and sending the wrong one is silently ignored, which is
      // how the feed used to show every sale under a filtered heading.
      apiFetch<any>(`/sales/?${salesParams.toString()}`, { method: "GET" }).catch(() => ({ data: [] })),
    ]);

    // No bundle means no figures. Reporting zeroes here would read as a shop
    // that took nothing today, which is a different statement from "this did
    // not load".
    if (!payload) throw new Error("The dashboard returned no data.");

    // The greeting name, not the full name: the heading reads "Welcome, ___".
    return toDashboardResponse(
      payload,
      { name: user.greeting, email: user.email },
      Array.isArray(sales) ? sales : sales?.data || []
    );
  }

  /**
   * The parts of the dashboard, taken from that one bundle.
   *
   * There is no `/dashboard/metrics` or `/dashboard/sales-summary` on the
   * server, so these slice the bundle instead of calling URLs that fail.
   */
  static async getMetrics(): Promise<MetricCardData[]> {
    return (await DashboardService.getDashboardData()).metrics;
  }

  static async getSalesSummary(): Promise<SalesDataPoint[]> {
    return (await DashboardService.getDashboardData()).salesSummary;
  }

  /** Empty for now: the server has no activity feed. */
  static async getRecentActivities(): Promise<RecentActivityItem[]> {
    return [];
  }
}
