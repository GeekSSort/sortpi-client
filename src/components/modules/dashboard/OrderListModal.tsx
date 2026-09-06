"use client";

import React, { useMemo } from "react";
import { OverviewService } from "@/services";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { OrderListItem } from "@/types/overview";
import StatusPill from "@/components/shared/StatusPill";
import OverviewPanel, { PANEL_CELL, PANEL_HEAD, PANEL_TEXT } from "./OverviewPanel";

/** The TOTAL ORDERS card's panel — the purchase orders behind the count. */

const GRID = "grid-cols-[150fr_170fr_150fr_90fr_140fr_130fr_120fr]";
const FILTERS = ["All orders", "Received", "Pending"] as const;
const taka = (n: number) => `৳ ${n.toLocaleString("en-IN")}`;

export default function OrderListModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Only asks while the panel is open, and the answer is shared with every
  // other screen reading this key — reopening the panel repaints from cache
  // instead of blanking the table for the length of a round trip.
  const {
    data: orders,
    loading,
    error,
    refetch,
  } = useQuery(queryKey("overview-orders"), () => OverviewService.getOrders(), { enabled: isOpen });

  const rows = useMemo(() => orders ?? [], [orders]);

  const stats = useMemo(() => {
    const pending = rows.filter((o) => o.status === "Pending");
    const due = rows.filter((o) => o.paymentStatus === "Due");
    return [
      { label: "Orders", value: String(rows.length) },
      { label: "Order value", value: taka(rows.reduce((s, o) => s + o.totalAmount, 0)) },
      { label: "Pending / Due", value: `${pending.length} · ${due.length}` },
    ];
  }, [rows]);

  return (
    <OverviewPanel<OrderListItem>
      open={isOpen}
      onClose={onClose}
      title="Order List"
      subtitle="Purchase orders behind today’s order count."
      searchPlaceholder="Search by purchase ID or supplier..."
      rows={rows}
      searchable={(r) => `${r.purchaseId} ${r.supplier.name}`}
      filters={FILTERS}
      matchesFilter={(r, f) => r.status === f}
      stats={stats}
      grid={GRID}
      loading={loading}
      error={error}
      onRetry={refetch}
      emptyText="No orders match that search."
      head={
        <>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Purchase ID</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Supplier</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Purchase Date</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Items</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Total Amount</span></div>
          <div className={`${PANEL_CELL} h-[40px] justify-center`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Payment</span></div>
          <div className={`${PANEL_CELL} h-[40px] justify-center`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Status</span></div>
        </>
      }
      renderRow={(r) => (
        <>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate !text-[#1e1e1e]`}>{r.purchaseId}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.supplier.name}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.purchaseDate}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.items}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate !text-[#1e1e1e]`}>{r.totalAmountFormatted}</span></div>
          <div className={`${PANEL_CELL} justify-center`}>
            <StatusPill label={r.paymentStatus} tone={r.paymentStatus === "Paid" ? "green" : "gold"} />
          </div>
          <div className={`${PANEL_CELL} justify-center`}>
            <StatusPill label={r.status} tone={r.status === "Received" ? "green" : "gold"} />
          </div>
        </>
      )}
    />
  );
}
