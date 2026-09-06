import { DashboardResponse, MetricCardData, SalesDataPoint, RecentActivityItem } from "@/types/dashboard";
import { initialDashboardData } from "@/lib/mock-dashboard-data";
import { apiFetch } from "./apiClient";
import { toDashboardResponse } from "./mappers/dashboard";
import { AuthService } from "./authService";

export { initialDashboardData };

export class DashboardService {
  /**
   * Everything the dashboard shows, in one go.
   *
   * The branch goes in the query string. The server scopes reports on
   * `branch_id`, not on the branch stamped in the token, so without it every
   * branch showed the whole company's figures.
   */
  static async getDashboardData(branchId?: string | null): Promise<DashboardResponse> {
    const scope = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
    // The endpoint returns figures only: five summaries, no person and no
    // cards. The mapper builds the screen from them, and the greeting comes
    // from whoever is signed in.
    const [payload, user, sales] = await Promise.all([
      apiFetch<any>(`/dashboard/${scope}`, { method: "GET" }, null),
      AuthService.getCurrentUser().catch(() => ({ greeting: "there", email: "" })),
      // Recent Activities is the sales list: the server has no feed of its own.
      apiFetch<any>(`/sales/?limit=8${branchId ? `&branch_id=${branchId}` : ""}`, { method: "GET" }, { data: [] }).catch(() => ({ data: [] })),
    ]);

    if (!payload) return initialDashboardData;
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
