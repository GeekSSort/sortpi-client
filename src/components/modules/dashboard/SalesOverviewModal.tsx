"use client";

import React, { useMemo } from "react";
import { OverviewService } from "@/services";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { SalesOverviewItem } from "@/types/overview";
import StatusPill from "@/components/shared/StatusPill";
import OverviewPanel, { PANEL_CELL, PANEL_HEAD, PANEL_TEXT } from "./OverviewPanel";

/** The TOTAL SALES card's panel — every invoice behind the figure. */

const GRID = "grid-cols-[140fr_170fr_170fr_140fr_150fr_110fr]";
const FILTERS = ["All payments", "Paid", "Unpaid"] as const;
const taka = (n: number) => `৳ ${n.toLocaleString("en-IN")}`;

export default function SalesOverviewModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Only asks while the panel is open, and the answer is shared with every
  // other screen reading this key — reopening the panel repaints from cache
  // instead of blanking the table for the length of a round trip.
  const {
    data: sales,
    loading,
    error,
    refetch,
  } = useQuery(queryKey("overview-sales"), () => OverviewService.getSalesOverview(), { enabled: isOpen });

  const rows = useMemo(() => sales ?? [], [sales]);

  const stats = useMemo(() => {
    const total = rows.reduce((s, x) => s + x.totalAmount, 0);
    const unpaid = rows.filter((x) => x.status === "Unpaid");
    return [
      { label: "Invoices", value: String(rows.length) },
      { label: "Collected", value: taka(total - unpaid.reduce((s, x) => s + x.totalAmount, 0)) },
      { label: "Unpaid", value: `${unpaid.length} · ${taka(unpaid.reduce((s, x) => s + x.totalAmount, 0))}` },
    ];
  }, [rows]);

  return (
    <OverviewPanel<SalesOverviewItem>
      open={isOpen}
      onClose={onClose}
      title="Sales Overview"
      subtitle="Every invoice behind today’s sales figure."
      searchPlaceholder="Search by customer, invoice or method..."
      rows={rows}
      searchable={(r) => `${r.customer} ${r.invoiceNo} ${r.paymentMethod}`}
      filters={FILTERS}
      matchesFilter={(r, f) => r.status === f}
      stats={stats}
      grid={GRID}
      loading={loading}
      error={error}
      onRetry={refetch}
      emptyText="No invoices match that search."
      head={
        <>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Invoice No.</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Date &amp; Time</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Customer</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Total Amount</span></div>
          <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Payment Method</span></div>
          <div className={`${PANEL_CELL} h-[40px] justify-center`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Status</span></div>
        </>
      }
      renderRow={(r) => (
        <>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate !text-[#1e1e1e]`}>{r.invoiceNo}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.dateTime}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.customer}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate !text-[#1e1e1e]`}>{r.totalAmountFormatted}</span></div>
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.paymentMethod}</span></div>
          <div className={`${PANEL_CELL} justify-center`}>
            <StatusPill label={r.status} tone={r.status === "Paid" ? "green" : "gold"} />
          </div>
        </>
      )}
    />
  );
}
