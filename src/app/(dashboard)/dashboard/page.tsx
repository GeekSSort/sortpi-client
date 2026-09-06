"use client";

import React, { useState, useEffect } from "react";
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
import { DashboardService, initialDashboardData } from "@/services";
import { DashboardResponse } from "@/types/dashboard";
import { OverviewModalType } from "@/types/overview";
import { matchesDay } from "@/lib/dateFilter";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse>(initialDashboardData);
  const [loading, setLoading] = useState(false);
  const [activeModal, setActiveModal] = useState<OverviewModalType>(null);
  const [day, setDay] = useState<Date | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await DashboardService.getDashboardData(tokenStore.branch());
        setData(res);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    // No branch key any more. The switcher moved to the top bar and reloads
    // the page, because a switch changes the answer to every request on it —
    // re-running this one fetch left the rest of the screen on the branch the
    // user had just left.
  }, []);

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

  return (
    <div className="flex w-full flex-col gap-[24px]">
      {/* Headline + KPI row travel together, 14px apart (Figma 30:15371). */}
      <div className="flex flex-col gap-[14px]">
        <Headline name={data.user?.name ?? "there"} onDateChange={setDay} />
        <MetricCards metrics={data.metrics} onCardClick={handleMetricCardClick} />
      </div>

      {/* Lower Dashboard Section: Anchor for Docked Panels aligned with Sales Summary */}
      <div className="relative w-full">
        {/* Background Content (Charts + Recent Activities) */}
        <div className={`flex flex-col gap-[24px] transition-all duration-300 ${activeModal ? "opacity-30 blur-[0.2px] select-none pointer-events-none" : "opacity-100"}`}>
          {/* Charts Grid Row (Sales Summary + Profit & Loss) */}
          <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-[757fr_383fr]">
            {/* Sales Summary Line Chart (approx 63% width) */}
            <div className="min-w-0">
              <SalesSummaryChart data={data.salesSummary} />
            </div>

            {/* Profit & Loss Donut Chart (approx 37% width) */}
            <div className="min-w-0">
              <ProfitLossChart data={data.profitLoss} />
            </div>
          </div>

          {/* Recent Activities Data Table */}
          <RecentActivitiesTable activities={(data.recentActivities ?? []).filter((a) => matchesDay(a.dateTime, day))} />
        </div>

        {/* Docked Slide-over Panels: Anchored strictly within the lower section aligned with Sales Summary */}
        <RevenueOverviewModal
          isOpen={activeModal === "revenue"}
          onClose={() => setActiveModal(null)}
          data={data.salesSummary}
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
