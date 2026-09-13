"use client";

import React, { useMemo } from "react";
import { OverviewService } from "@/services";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { SalesOverviewItem } from "@/types/overview";
import StatusPill from "@/components/shared/StatusPill";
import OverviewPanel, { PANEL_CELL, PANEL_HEAD, PANEL_TEXT } from "./OverviewPanel";
import { usePartialPayment } from "@/components/shared/usePartialPayment";

/** The TOTAL SALES card's panel — every invoice behind the figure. */

/** Two shapes, as the Sales table has: see `usePartialPayment`. */
const GRID_FULL = "grid-cols-[140fr_170fr_170fr_140fr_150fr_110fr]";
const GRID_PARTIAL = "grid-cols-[125fr_140fr_140fr_120fr_165fr_112fr_125fr_105fr]";
const FILTERS_FULL = ["All payments", "Paid", "Unpaid"] as const;
const FILTERS_PARTIAL = ["All payments", "Paid", "Partial", "Unpaid"] as const;
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
  const { allowPartial } = usePartialPayment();

  /**
   * Summed from what was actually taken, not inferred from the status.
   *
   * "Collected" used to be the total of every invoice MINUS the full total of
   * the unpaid ones, and "Unpaid" their full total. Both are wrong the moment
   * a sale is part settled: an invoice of 1,000 with 600 in the drawer counted
   * as 1,000 outstanding and 0 collected, so the panel under-reported takings
   * and over-reported debt by the same 600. Paid and due are on the row —
   * adding them up is both simpler and right in either mode.
   */
  const stats = useMemo(() => {
    const collected = rows.reduce((s, x) => s + x.paidAmount, 0);
    const owing = rows.filter((x) => x.dueAmount > 0);
    return [
      { label: "Invoices", value: String(rows.length) },
      { label: "Collected", value: taka(collected) },
      {
        label: "Outstanding",
        value: `${owing.length} · ${taka(owing.reduce((s, x) => s + x.dueAmount, 0))}`,
      },
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
      filters={allowPartial ? FILTERS_PARTIAL : FILTERS_FULL}
      matchesFilter={(r, f) => r.status === f}
      stats={stats}
      grid={allowPartial ? GRID_PARTIAL : GRID_FULL}
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
          {allowPartial && (
            <>
              <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Amount Received</span></div>
              <div className={`${PANEL_CELL} h-[40px]`}><span className={`${PANEL_HEAD} whitespace-nowrap`}>Due</span></div>
            </>
          )}
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
          {allowPartial && (
            <>
              <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.paidAmountFormatted}</span></div>
              <div className={PANEL_CELL}>
                <span className={`${PANEL_TEXT} truncate ${r.dueAmount > 0 ? "!font-semibold !text-[#e63946]" : ""}`}>
                  {r.dueAmountFormatted}
                </span>
              </div>
            </>
          )}
          <div className={PANEL_CELL}><span className={`${PANEL_TEXT} truncate`}>{r.paymentMethod}</span></div>
          <div className={`${PANEL_CELL} justify-center`}>
            {/* Three tones for three states: nothing paid is the one to chase,
                and it read as the same amber as a half-settled invoice. */}
            <StatusPill
              label={r.status}
              tone={r.status === "Paid" ? "green" : r.status === "Partial" ? "gold" : "orange"}
            />
          </div>
        </>
      )}
    />
  );
}
