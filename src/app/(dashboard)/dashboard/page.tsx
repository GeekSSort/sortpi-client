"use client";

import React, { useMemo, useState } from "react";
import Headline from "@/components/modules/dashboard/Headline";
import MetricCards from "@/components/modules/dashboard/MetricCards";
import SalesSummaryChart from "@/components/modules/dashboard/SalesSummaryChart";
import ProfitLossChart from "@/components/modules/dashboard/ProfitLossChart";
import RecentActivitiesTable from "@/components/modules/dashboard/RecentActivitiesTable";
import SalesOverviewModal from "@/components/modules/dashboard/SalesOverviewModal";
import OrderListModal from "@/components/modules/dashboard/OrderListModal";
import CustomerListModal from "@/components/modules/dashboard/CustomerListModal";
import RevenueOverviewModal from "@/components/modules/dashboard/RevenueOverviewModal";
import { tokenStore } from "@/services/apiClient";
import { useSession } from "@/services/useSession";
import { DashboardService } from "@/services";
import { OverviewModalType } from "@/types/overview";
import { toApiDay } from "@/lib/dateFilter";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { resolveRange, type RangeOption } from "@/lib/range";
import {
  StatCardsSkeleton,
  ChartSkeleton,
  ListSkeleton,
  SkeletonLine,
} from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar, ErrorState } from "@/components/shared/QueryBoundary";

export default function DashboardPage() {
  const [activeModal, setActiveModal] = useState<OverviewModalType>(null);
  const [day, setDay] = useState<Date | null>(null);

  // The branch is part of the key, not just the query string: two branches are
  // two different answers and must not share one cache slot.
  const branchId = tokenStore.branch();

  /**
   * Each card owns its own range and its own request.
   *
   * Both pickers used to set nothing but their own caption, so "Today" and
   * "This Year" drew the same figures. The reports endpoint takes
   * `from_date`/`to_date`, so the honest fix is to ask it for the window that
   * was picked — which means two queries, one per card, each cached under its
   * own key. Picking a range you have already viewed repaints from cache.
   *
   * `today` is state rather than a call to `new Date()` in the body: reading
   * the clock during render is impure, and the dashboard should not silently
   * change what it means at midnight while somebody is looking at it.
   */
  const [today] = useState(() => new Date());
  const [salesRange, setSalesRange] = useState<RangeOption>("This Week");
  /**
   * The headline pill is the whole-dashboard filter: pick a day and the metric
   * cards and the activity feed answer for THAT day, clear it and they answer
   * for all time — which is what the pill now says when nothing is picked.
   *
   * It used to set a variable that only `matchesDay` read, and that compared
   * FORMATTED date strings on the eight rows already fetched. So the figures
   * above never moved, and the feed filtered a page rather than the books.
   */
  const dayWindow = useMemo(
    () => (day ? { fromDate: toApiDay(day), toDate: toApiDay(day) } : undefined),
    [day]
  );
  const [pnlRange, setPnlRange] = useState<RangeOption>("This Week");

  const salesWindow = useMemo(() => resolveRange(salesRange, today), [salesRange, today]);
  const pnlWindow = useMemo(() => resolveRange(pnlRange, today), [pnlRange, today]);

  // The metric cards and the activity feed: the headline pill's window, or all
  // of time when nothing is picked.
  const { data, loading, fetching, error, refetch } = useQuery(
    queryKey("dashboard", { branch: branchId, ...(dayWindow ?? { scope: "all" }) }),
    () => DashboardService.getDashboardData(branchId, dayWindow),
    { staleMs: 30_000 }
  );

  // The Sales Summary card, on its own range.
  const {
    data: salesData,
    fetching: salesFetching,
    error: salesError,
    refetch: refetchSales,
  } = useQuery(
    queryKey("dashboard", { branch: branchId, ...salesWindow }),
    () => DashboardService.getDashboardData(branchId, salesWindow),
    { staleMs: 30_000 }
  );

  // Same endpoint, a different window, so it is a different cache entry. When
  // both cards sit on the same range the keys match and it is one request.
  const {
    data: pnlData,
    fetching: pnlFetching,
    error: pnlError,
    refetch: refetchPnl,
  } = useQuery(
    queryKey("dashboard", { branch: branchId, ...pnlWindow }),
    () => DashboardService.getDashboardData(branchId, pnlWindow),
    { staleMs: 30_000 }
  );

  const handleMetricCardClick = (cardId: string) => {
    if (cardId === "revenue") {
      // Revenue used to open the Sales panel; it has its own breakdown now.
      setActiveModal(activeModal === "revenue" ? null : "revenue");
    } else if (cardId === "sales") {
      setActiveModal(activeModal === "sales" ? null : "sales");
    } else if (cardId === "orders") {
      setActiveModal(activeModal === "orders" ? null : "orders");
    } else if (cardId === "customers") {
      setActiveModal(activeModal === "customers" ? null : "customers");
    }
  };

  const hasData = data !== undefined;

  /**
   * The greeting comes from the SESSION, not from the dashboard bundle.
   *
   * It is a property of who is signed in, not of the date range being viewed,
   * and reading it from the bundle meant every range change blanked the name —
   * which made the page render a skeleton in the headline's place, unmount the
   * date pill and reset it.
   */
  const { user: sessionUser } = useSession();
  const greeting = sessionUser?.greeting || sessionUser?.name || data?.user?.name || "";

  return (
    <div className="relative flex w-full flex-col gap-[24px]">
      <RefreshBar active={fetching} />

      {/* Headline + KPI row travel together, 14px apart (Figma 30:15371). */}
      <div className="flex flex-col gap-[14px]">
        {/* The headline stays MOUNTED across a range change. Swapping it for a
            skeleton unmounted the date pill and reset it, so the figures moved
            while the pill said "All time". Only the NAME waits for data; the
            greeting used to be seeded with a sample person, so a failed request
            left someone else's name on screen. */}
        {hasData || greeting ? (
          <Headline name={greeting || "there"} date={day} onDateChange={setDay} />
        ) : (
          <div className="flex h-[64px] items-center">
            <SkeletonLine width={280} height={28} />
          </div>
        )}

        <QueryBoundary
          loading={loading}
          error={error}
          hasData={hasData}
          skeleton={<StatCardsSkeleton count={4} />}
          errorMessage="Could not load the dashboard."
          onRetry={refetch}
        >
          {hasData && (
            <MetricCards metrics={data.metrics} onCardClick={handleMetricCardClick} />
          )}
        </QueryBoundary>
      </div>

      {/* Lower Dashboard Section: Anchor for Docked Panels aligned with Sales Summary */}
      <div className="relative w-full">
        {/* Background Content (Charts + Recent Activities) */}
        <div className={`flex flex-col gap-[24px] transition-all duration-300 ${activeModal ? "opacity-30 blur-[0.2px] pointer-events-none" : "opacity-100"}`}>
          {/* Charts Grid Row (Sales Summary + Profit & Loss) */}
          <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-[757fr_383fr]">
            {/* Sales Summary Line Chart (approx 63% width) */}
            <div className="min-w-0">
              {salesData ? (
                <SalesSummaryChart
                  data={salesData?.salesSummary ?? []}
                  range={salesRange}
                  onRangeChange={setSalesRange}
                  busy={salesFetching}
                />
              ) : salesError ? (
                <div className="flex h-full flex-col overflow-hidden rounded-[10px] bg-white px-[16px] py-[16px] shadow-[inset_0_0_0_1px_#eaeaea] sm:px-[33.5px]">
                  <ErrorState message="Could not load the sales summary." onRetry={refetchSales} compact />
                </div>
              ) : (
                <div className="flex h-full flex-col overflow-hidden rounded-[10px] bg-white px-[16px] py-[16px] shadow-[inset_0_0_0_1px_#eaeaea] sm:px-[33.5px]">
                  <ChartSkeleton height={260} />
                </div>
              )}
            </div>

            {/* Profit & Loss Donut Chart (approx 37% width) */}
            <div className="min-w-0">
              {pnlData ? (
                <ProfitLossChart
                  data={pnlData.profitLoss}
                  range={pnlRange}
                  onRangeChange={setPnlRange}
                  busy={pnlFetching}
                />
              ) : pnlError ? (
                <div className="flex h-full flex-col rounded-[12px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea]">
                  <ErrorState message="Could not load profit &amp; loss." onRetry={refetchPnl} compact />
                </div>
              ) : (
                <div className="flex h-full flex-col rounded-[12px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea]">
                  <ChartSkeleton height={220} />
                </div>
              )}
            </div>
          </div>

          {/* Recent Activities Data Table */}
          {hasData ? (
            <RecentActivitiesTable
              activities={data.recentActivities ?? []}
            />
          ) : (
            <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
              <div className="flex h-[48px] items-center justify-center px-[16px]">
                <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] text-[#1e1e1e]">
                  Recent Activities
                </p>
              </div>
              <div className="px-[16px] pb-[16px]">
                {error ? (
                  <ErrorState message="Could not load recent activities." onRetry={refetch} compact />
                ) : (
                  <ListSkeleton rows={8} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Docked Slide-over Panels: Anchored strictly within the lower section aligned with Sales Summary */}
        <RevenueOverviewModal
          isOpen={activeModal === "revenue"}
          onClose={() => setActiveModal(null)}
          data={data?.salesSummary ?? []}
        />

        <SalesOverviewModal
          isOpen={activeModal === "sales"}
          onClose={() => setActiveModal(null)}
        />

        <OrderListModal
          isOpen={activeModal === "orders"}
          onClose={() => setActiveModal(null)}
        />

        <CustomerListModal
          isOpen={activeModal === "customers"}
          onClose={() => setActiveModal(null)}
        />
      </div>
    </div>
  );
}
