"use client";

import React, { useMemo } from "react";
import { OverviewService } from "@/services";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { CustomerListItem } from "@/types/overview";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import OverviewPanel, { PANEL_CELL, PANEL_HEAD, PANEL_TEXT } from "./OverviewPanel";

/** The TOTAL CUSTOMERS card's panel — who is behind the count. */

const GRID = "grid-cols-[130fr_160fr_150fr_100fr_80fr_130fr_120fr_110fr]";
const FILTERS = ["All customers", "Active", "Inactive"] as const;
const TYPE_TONE: Record<CustomerListItem["type"], Tone> = {
  VIP: "gold",
  Premium: "orange",
  Regular: "slate",
};
const taka = (n: number) => `৳ ${n.toLocaleString("en-IN")}`;

export default function CustomerListModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Only asks while the panel is open, and the answer is shared with every
  // other screen reading this key — reopening the panel repaints from cache
  // instead of blanking the table for the length of a round trip.
  const {
    data: customers,
    loading,
    error,
    refetch,
  } = useQuery(queryKey("overview-customers"), () => OverviewService.getCustomers(), { enabled: isOpen });

  const rows = useMemo(() => customers ?? [], [customers]);

  const stats = useMemo(() => {
    const due = rows.reduce((s, c) => s + c.due, 0);
    return [
      { label: "Customers", value: String(rows.length) },
      { label: "Lifetime spend", value: taka(rows.reduce((s, c) => s + c.totalSpent, 0)) },
      { label: "Outstanding due", value: taka(due) },
    ];
  }, [rows]);

  return (
    <OverviewPanel<CustomerListItem>
      open={isOpen}
      onClose={onClose}
      title="Customer List"
      subtitle="The people behind your customer count."
      searchPlaceholder="Search by customer, ID or phone..."
      rows={rows}
      searchable={(r) => `${r.customer} ${r.customerId} ${r.phone}`}
      filters={FILTERS}
      matchesFilter={(r, f) => r.status === f}
      stats={stats}
      grid={GRID}
      loading={loading}
      error={error}
      onRetry={refetch}
      minWidth={900}
      emptyText="No customers match that search."
      head={
        <>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Customer ID</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Customer</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Phone</span></div>
          <div className={`${PANEL_CELL} h-[40px] justify-center`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Type</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Order</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Total Spent</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Due</span></div>
          <div className={`${PANEL_CELL} h-[40px] justify-center`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Status</span></div>
        </>
      }
      renderRow={(r) => (
        <>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate !text-[#1e1e1e]`}>{r.customerId}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.customer}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.phone}</span></div>
          <div className={`${PANEL_CELL} justify-center`}>
            <StatusPill label={r.type} tone={TYPE_TONE[r.type] ?? "slate"} />
          </div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.order}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate !text-[#1e1e1e]`}>{r.totalSpentFormatted}</span></div>
          <div className={PANEL_CELL}>
            <span className={`${PANEL_TEXT} truncate ${r.due > 0 ? "!text-[#e63946]" : ""}`}>{r.dueFormatted}</span>
          </div>
          <div className={`${PANEL_CELL} justify-center`}>
            <StatusPill label={r.status} tone={r.status === "Active" ? "green" : "rose"} />
          </div>
        </>
      )}
    />
  );
}
