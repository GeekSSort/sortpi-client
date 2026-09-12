"use client";

import React, { useMemo, useState } from "react";

import { ReportService, type ReportWindow } from "@/services/reportService";
import { TransferService } from "@/services";
import { tokenStore } from "@/services/apiClient";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { formatMoney } from "@/lib/format";
import DateFilter, { ALL_DATES, type DateValue, resolveDates } from "@/components/shared/DateFilter";
import FilterDropdown from "@/components/shared/FilterDropdown";
import VariantChip from "@/components/shared/VariantChip";
import ReportCard, { MiniTable } from "@/components/modules/reports/ReportCard";
import { AreaChart, BarList, ColumnChart, DonutChart } from "@/components/modules/reports/Charts";
import {
  CustomersIcon,
  OrdersIcon,
  RevenueIcon,
  SalesIcon,
} from "@/components/modules/dashboard/MetricIcons";

/**
 * Reports — an analytics workspace.
 *
 * A WALL of report cards, all on screen at once, over one set of filters.
 * Deliberately not the dashboard, and deliberately not a single card with a
 * report picker either:
 *
 *   Dashboard — "what is happening?" Four KPIs and a chart, read at a glance.
 *   Reports   — "why, and what are the details?" Eight views of the same
 *               window, side by side, so payment mix can be read against top
 *               sellers against what is running out.
 *
 * A picker would hide seven of them behind a closed menu. Eight and not
 * fifteen: the ones cut were the same facts read a second way — most
 * profitable beside top selling, supplier dues beside customer dues — and a
 * wall a reader has to scroll is a wall nobody reads to the end of.
 *
 * Each card is short on purpose: the head of its report, with its own Export
 * for the whole of it, because the value here is the comparison ACROSS cards
 * and a hundred rows in one buries the rest.
 *
 * Charts where the shape is the answer (a proportion, a ranking, a trend) and
 * a small table where the figures are.
 */

const money = (n: number) => formatMoney(n, { decimals: 2 });
const short = (n: number) =>
  n >= 100000 ? `৳${(n / 100000).toFixed(1)}L` : `৳${Math.round(n).toLocaleString("en-IN")}`;
const qty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
const sum = <T,>(rows: T[], read: (r: T) => number) => rows.reduce((t, r) => t + read(r), 0);

/** A field is safe in a CSV only once quotes are doubled and it is wrapped. */
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function ReportsPage() {
  // `DateValue` and `FilterDropdown` are what Sales, Purchases and Customers
  // filter with, so this page filters the same way.
  const [dates, setDates] = useState<DateValue>(ALL_DATES);
  const [branch, setBranch] = useState<string>(tokenStore.branch() ?? "");

  const span = useMemo(() => resolveDates(dates), [dates]);
  const window: ReportWindow = useMemo(
    () => ({ branchId: branch || null, fromDate: span.from, toDate: span.to }),
    [branch, span.from, span.to]
  );
  const key = useMemo(
    () => ({ branch: branch || "all", from: span.from ?? "all", to: span.to ?? "all" }),
    [branch, span.from, span.to]
  );

  /** The branches this caller can narrow to. Warehouses name their branch. */
  const branchQuery = useQuery(queryKey("warehouses"), () => TransferService.getWarehouses());
  const branches = useMemo(() => {
    const seen = new Map<string, string>();
    for (const w of branchQuery.data ?? []) {
      if (w.branchId && !seen.has(w.branchId)) {
        seen.set(w.branchId, String(w.name || "").split("-")[0] || w.name || "Branch");
      }
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [branchQuery.data]);

  // Every card under one window, so they can be read against each other.
  const trend = useQuery(queryKey("report-daily", key), () => ReportService.salesDaily(window));
  const products = useQuery(queryKey("report-products", key), () => ReportService.salesByProduct(window));
  const categories = useQuery(queryKey("report-categories", key), () => ReportService.salesByCategory(window));
  const tenders = useQuery(queryKey("report-tenders", key), () => ReportService.salesByPaymentMethod(window));
  const branchRows = useQuery(queryKey("report-branches", key), () => ReportService.salesByBranch(window));
  const lowStock = useQuery(queryKey("report-lowstock", key), () => ReportService.lowStock(window));
  const pnl = useQuery(queryKey("report-pnl", key), () => ReportService.profitAndLoss(window));
  const receivables = useQuery(queryKey("report-receivables", key), () => ReportService.customerDue(window));

  const productRows = useMemo(() => products.data ?? [], [products.data]);

  /**
   * The four figures, summed from the PRODUCT report.
   *
   * One source for all of them, so the KPIs cannot disagree with the cards
   * beneath them — which is what happens when a summary is fetched separately
   * from the rows it summarises.
   */
  const totals = useMemo(() => {
    const revenue = sum(productRows, (r) => r.revenue);
    const cost = sum(productRows, (r) => r.cost);
    return {
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      units: sum(productRows, (r) => r.quantitySold),
      lines: productRows.length,
    };
  }, [productRows]);

  /**
   * Writes one card's WHOLE report, under the filters on screen.
   *
   * Built from the rows the card is drawing rather than re-fetched, so the
   * file cannot disagree with the page it came from — the one thing an
   * exported report has to get right.
   */
  const save = (name: string, head: string[], rows: (string | number)[][]) => {
    if (rows.length === 0) return;
    const csv = [head, ...rows].map((line) => line.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${span.from ?? "all"}-${span.to ?? "all"}.csv`
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-full flex-col gap-[16px]">
      {/* Headline — the filters every list screen carries, on the right. */}
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-[16px]">
        <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] text-[#1e1e1e]">
          {span.from ? `${span.from} — ${span.to}` : "All time"}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
          {branches.length > 1 && (
            <FilterDropdown
              label="Branch"
              value={branch}
              onChange={setBranch}
              options={[
                { value: "", label: "All branches" },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          )}
          <DateFilter value={dates} onChange={setDates} />
        </div>
      </div>

      {/* Four KPIs, each its own card, as the dashboard's row is. */}
      <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Revenue" value={money(totals.revenue)} icon={<RevenueIcon />} />
        <Kpi label="Cost of goods" value={money(totals.cost)} icon={<OrdersIcon />} />
        <Kpi
          label="Gross profit"
          value={money(totals.profit)}
          icon={<SalesIcon />}
          note={`${totals.margin.toFixed(1)}% margin`}
        />
        <Kpi
          label="Units sold"
          value={qty(totals.units)}
          icon={<CustomersIcon />}
          note={`${totals.lines} variants`}
        />
      </div>

      {/* The wall. Two per row on a desktop, one on a phone. */}
      <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-2">
        {/* Trend — the only card that wants the full width. */}
        <ReportCard
          title="Revenue against cost"
          query={trend}
          wide
          onExport={() =>
            save(
              "sales-trend",
              ["Date", "Revenue", "Cost", "Gross profit", "Sales"],
              (trend.data ?? []).map((r) => [r.at, r.revenue, r.cost, r.grossProfit, r.saleCount])
            )
          }
        >
          <AreaChart
            points={(trend.data ?? []).map((p) => ({ at: p.at, a: p.revenue, b: p.cost }))}
            labels={{ a: "Revenue", b: "Cost of goods" }}
          />
        </ReportCard>

        {/* Payment mix — a proportion, so a donut. */}
        <ReportCard
          title="Payment methods by revenue"
          query={tenders}
          onExport={() =>
            save(
              "payment-methods",
              ["Payment method", "Payments", "Amount", "Share %"],
              (tenders.data ?? []).map((r) => [r.label, r.count, r.amount, r.share])
            )
          }
        >
          <DonutChart
            slices={(tenders.data ?? []).map((r) => ({ label: r.label, value: r.amount }))}
            total={short(sum(tenders.data ?? [], (r) => r.amount))}
            totalLabel="Taken"
          />
        </ReportCard>

        {/* Category mix — also a proportion. */}
        <ReportCard
          title="Revenue by category"
          query={categories}
          onExport={() =>
            save(
              "sales-by-category",
              ["Category", "Units", "Revenue", "Cost", "Gross profit"],
              (categories.data ?? []).map((r) => [r.name, r.quantitySold, r.revenue, r.cost, r.grossProfit])
            )
          }
        >
          <DonutChart
            slices={(categories.data ?? []).map((r) => ({ label: r.name, value: r.revenue }))}
            total={short(sum(categories.data ?? [], (r) => r.revenue))}
            totalLabel="Revenue"
          />
        </ReportCard>

        {/* Top variants — a ranking, so bars. Variant-aware: a 500ml and a 1L
            are different rows, which is the whole point of the column. */}
        <ReportCard
          title="Top products & variants"
          query={products}
          onExport={() =>
            save(
              "sales-by-product",
              ["Product", "Variant", "SKU", "Units", "Revenue", "Cost", "Gross profit"],
              productRows.map((r) => [
                r.name, r.variantLabel, r.sku, r.quantitySold, r.revenue, r.cost, r.grossProfit,
              ])
            )
          }
        >
          <BarList
            rows={productRows.map((r) => ({
              label: r.variantLabel ? `${r.name} · ${r.variantLabel}` : r.name,
              value: r.revenue,
            }))}
            formatValue={short}
          />
        </ReportCard>

        {/* Branches — few, short names, compared side by side. */}
        <ReportCard
          title="Branch performance"
          query={branchRows}
          onExport={() =>
            save(
              "sales-by-branch",
              ["Branch", "Sales", "Revenue", "Cost", "Gross profit"],
              (branchRows.data ?? []).map((r) => [r.name, r.saleCount, r.revenue, r.cost, r.grossProfit])
            )
          }
        >
          <ColumnChart
            rows={(branchRows.data ?? []).map((r) => ({ label: r.name, value: r.revenue }))}
            formatValue={short}
          />
        </ReportCard>

        {/* Profit & loss — a statement, so neither a chart nor a table. */}
        <ReportCard
          title="Profit & loss"
          query={pnl}
          onExport={() => {
            const p = pnl.data;
            save(
              "profit-and-loss",
              ["Line", "Amount"],
              p
                ? [
                    ["Revenue", p.revenue],
                    ["Cost of goods", p.cost],
                    ["Gross profit", p.grossProfit],
                    ["Expenses", p.expenses],
                    ["Net profit", p.netProfit],
                  ]
                : []
            );
          }}
        >
          <PnLStatement pnl={pnl.data} />
        </ReportCard>

        {/* Money owed, both directions, side by side. */}
        <ReportCard
          title="Customer dues"
          query={receivables}
          onExport={() =>
            save("customer-dues", ["Customer", "Outstanding"], (receivables.data ?? []).map((r) => [r.name, r.outstanding]))
          }
        >
          <MiniTable
            rows={receivables.data ?? []}
            rowKey={(r) => r.name}
            empty="Nobody owes anything."
            columns={[
              { key: "name", label: "Customer", render: (r) => r.name },
              {
                key: "due", label: "Outstanding", align: "right",
                render: (r) => <span className="font-medium text-[#c62828]">{money(r.outstanding)}</span>,
              },
            ]}
          />
        </ReportCard>

        {/* Running out — the card somebody acts on today. */}
        <ReportCard
          title="Running out"
          query={lowStock}
          onExport={() =>
            save(
              "low-stock",
              ["Product", "Variant", "SKU", "Warehouse", "On hand", "Reorder at"],
              (lowStock.data ?? []).map((r) => [
                r.name, r.variantLabel, r.sku, r.warehouse, r.quantity, r.threshold,
              ])
            )
          }
        >
          <MiniTable
            rows={lowStock.data ?? []}
            rowKey={(r) => `${r.sku}-${r.warehouse}`}
            empty="Nothing is running out."
            columns={[
              {
                key: "product", label: "Product",
                render: (r) => (
                  <span className="flex min-w-0 items-center gap-[6px]">
                    <span className="truncate">{r.name}</span>
                    <VariantChip label={r.variantLabel} size="xs" />
                  </span>
                ),
              },
              { key: "left", label: "Left", align: "right", render: (r) => <span className="font-medium text-[#c62828]">{qty(r.quantity)}</span> },
              { key: "at", label: "Reorder at", align: "right", render: (r) => qty(r.threshold) },
            ]}
          />
        </ReportCard>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col items-start overflow-clip rounded-[10px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea]">
      <div className="flex w-full items-start gap-[14px]">
        <span className="flex size-[40px] shrink-0 items-center justify-center overflow-clip rounded-[25px] border border-solid border-[#f5b800] bg-white text-[#f5b800]">
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-[8px]">
          <p className="w-full text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252] uppercase">
            {label}
          </p>
          <p className="w-full truncate text-[20px] leading-[1.5] font-medium tracking-[-0.4px] tabular-nums text-[#262626]">
            {value}
          </p>
          {/* The second fact the figure needs to be read — a margin under a
              profit. Not a trend pill: this page has no "versus" window, and
              inventing one would be a comparison nobody asked for. */}
          {note && (
            <span className="flex h-[24px] max-w-full shrink-0 items-center gap-[7px] overflow-clip rounded-[17px] bg-[#fff8e1] px-[8px]">
              <span className="size-[6px] shrink-0 rounded-full bg-[#f5b800]" />
              <span className="truncate text-[12px] leading-[16px] tracking-[-0.24px] text-[#8a6200]">
                {note}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Profit & loss, as the lines of an account.
 *
 * Five rows and nothing to sort by, so a table would be furniture pretending
 * there is something to explore. The subtotals are ruled and bolder, because
 * that is how the document this imitates is read.
 */
function PnLStatement({
  pnl,
}: {
  pnl?: { revenue: number; cost: number; grossProfit: number; expenses: number; netProfit: number };
}) {
  if (!pnl) return null;
  const lines = [
    { label: "Revenue", value: pnl.revenue },
    { label: "Cost of goods sold", value: pnl.cost, deduct: true },
    { label: "Gross profit", value: pnl.grossProfit, rule: true, strong: true },
    { label: "Expenses", value: pnl.expenses, deduct: true },
    { label: "Net profit", value: pnl.netProfit, rule: true, strong: true },
  ];
  return (
    <dl className="flex flex-col">
      {lines.map((line) => (
        <div
          key={line.label}
          className={`flex items-center justify-between gap-[16px] py-[9px] ${
            line.rule ? "border-t border-solid border-[#eaeaea]" : ""
          }`}
        >
          <dt className={`text-[13px] tracking-[-0.26px] ${line.strong ? "font-medium text-[#1e1e1e]" : "text-[#525252]"}`}>
            {line.label}
          </dt>
          <dd
            className={`tabular-nums tracking-[-0.26px] ${line.strong ? "text-[15px] font-semibold" : "text-[13px]"} ${
              line.value < 0 ? "text-[#c62828]" : line.strong ? "text-[#1e1e1e]" : "text-[#525252]"
            }`}
          >
            {line.deduct && line.value > 0 ? `− ${money(line.value)}` : money(line.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
