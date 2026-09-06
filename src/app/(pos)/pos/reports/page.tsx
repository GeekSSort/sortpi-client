"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import MetricCards from "@/components/modules/dashboard/MetricCards";
import SalesSummaryChart from "@/components/modules/dashboard/SalesSummaryChart";
import ProfitLossChart from "@/components/modules/dashboard/ProfitLossChart";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { MODAL_GHOST } from "@/components/shared/Modal";
import { DashboardService, PosService, CustomerService, initialDashboardData } from "@/services";
import { DashboardResponse, MetricCardData } from "@/types/dashboard";
import { ProductItem } from "@/types/pos";
import { CustomerRecord } from "@/types/customer";

/**
 * POS Reports — Figma 247:7564.
 *
 * Four branch figures, Sales Summary beside Profit & Loss, top sellers, then
 * recent customers. The charts and the figures are the dashboard's own
 * components, so a fix to either shows up in both places.
 *
 * The frame says "Products" in its heading, which is a mistake in the file: the menu
 * and the route both say Reports, so the page does too.
 */

const TYPE_TONE: Record<CustomerRecord["type"], Tone> = {
  VIP: "gold",
  Premium: "orange",
  Regular: "slate",
};

// Customer ID  Customer  Phone  Email  Type  Total Spent  Due  Action
const GRID = "grid-cols-[150fr_150fr_180fr_210fr_110fr_130fr_120fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

/** The four branch figures the design asks for, taken from dashboard data. */
function branchMetrics(d: DashboardResponse): MetricCardData[] {
  const revenue = d.profitLoss.totalRevenue;
  const expenses = d.profitLoss.totalExpenses;
  const taka = (n: number) => `৳ ${Math.round(n).toLocaleString("en-IN")}`;
  const sales = d.salesSummary.reduce((s, p) => s + p.sales, 0);

  return [
    {
      id: "branch-revenue",
      title: "BRANCH REVENUE",
      value: taka(revenue),
      trend: "18.6%",
      trendType: "up",
      vsText: "vs. last month",
      icon: "revenue",
    },
    {
      id: "branch-sales",
      title: "BRANCH SALES",
      value: taka(sales),
      trend: "15.3%",
      trendType: "up",
      vsText: "vs yesterday",
      icon: "sales",
    },
    {
      id: "branch-profit",
      title: "BRANCH PROFIT",
      value: taka(d.profitLoss.netProfit),
      trend: "16.7%",
      trendType: "up",
      vsText: "vs last month",
      icon: "orders",
    },
    {
      id: "branch-expenses",
      title: "BRANCH EXPENSES",
      value: taka(expenses),
      trend: "8.4%",
      trendType: "up",
      vsText: "vs. last month",
      icon: "customers",
    },
  ];
}

function SearchIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M2.25 4.5h13.5M4.5 9h9M7.5 13.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function PosReportsPage() {
  const [data, setData] = useState<DashboardResponse>(initialDashboardData);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    DashboardService.getDashboardData()
      .then(setData)
      .catch(() => {});
    PosService.getProducts()
      .then(setProducts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Guarded so a slow answer for "ra" cannot land after "rahman" and
    // repopulate the table with the wrong rows.
    let live = true;
    setLoading(true);
    CustomerService.getCustomers({ search: query })
      .then((res) => {
        if (!live) return;
        setCustomers(res.data);
        setFailed(false);
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [query]);

  const metrics = useMemo(() => branchMetrics(data), [data]);

  // The design shows two rows of five. Sorted by stock movement is meaningless
  // on mock data, so the order is the catalogue's own.
  const topSelling = useMemo(() => products.slice(0, 10), [products]);

  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
  const current = Math.min(page, totalPages);
  const rows = useMemo(
    () => customers.slice((current - 1) * pageSize, current * pageSize),
    [customers, current, pageSize]
  );

  return (
    <div className="flex w-full flex-col gap-[24px] select-none">
      {/* Branch figures — 247:7663 */}
      <MetricCards metrics={metrics} />

      {/* Sales Summary beside Profit & Loss — 247:7757 / 247:7893 */}
      <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-[757fr_383fr]">
        <div className="min-w-0">
          <SalesSummaryChart data={data.salesSummary} />
        </div>
        <div className="min-w-0">
          <ProfitLossChart data={data.profitLoss} />
        </div>
      </div>

      {/* Top Selling Product — 247:8060 */}
      <div className="flex w-full flex-col gap-[16px]">
        <h2 className="text-[24px] leading-[1.2] font-medium tracking-[-0.72px] text-[#1e1e1e]">
          Top Selling Product
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-[14px]">
          {topSelling.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-[12px] overflow-clip rounded-[10px] bg-white p-[10px] shadow-[inset_0_0_0_1px_#eaeaea]"
            >
              <span className="relative size-[48px] shrink-0 overflow-hidden rounded-[8px] shadow-[inset_0_0_0_0.3px_#eaeaea]">
                <Image src={p.image} alt="" fill sizes="48px" className="object-cover" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
                <p className="truncate text-[14px] leading-[1.4] font-normal text-[#525252]">{p.name}</p>
                <div className="flex items-center justify-between gap-[6px]">
                  <span className="text-[16px] leading-[1.4] font-medium whitespace-nowrap text-[#f5b800]">
                    {p.priceFormatted}
                  </span>
                  <span className="flex h-[22px] shrink-0 items-center gap-[6px] overflow-clip rounded-[17px] bg-[#f5fff8] px-[8px]">
                    <span className="size-[6px] shrink-0 rounded-full bg-[#00b837]" />
                    <span className="text-[12px] leading-normal tracking-[-0.24px] whitespace-nowrap text-[#00b837]">
                      Stock {p.stock}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Customer List — 247:8332 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="flex flex-col items-stretch justify-between gap-[12px] px-[16px] pt-[16px] lg:flex-row lg:items-center">
          <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] whitespace-nowrap text-[#1e1e1e]">
            Recent Customer List
          </p>
          <div className="flex h-[44px] w-full items-center justify-between gap-[12px] rounded-[10px] bg-white px-[12px] shadow-[inset_0_0_0_1px_#eaeaea] lg:w-[370px]">
            <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by return ID, Invoice No. or Customer..."
                aria-label="Search customers"
                className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
              />
            </div>
            <button
              type="button"
              aria-label="Filter"
              onClick={() => setNote("Filter panel not designed yet")}
              className="shrink-0 cursor-pointer text-[#525252] transition-colors hover:text-[#1e1e1e]"
            >
              <FilterIcon />
            </button>
          </div>
        </div>

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1140px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
                {["Customer ID", "Customer", "Phone", "Email", "Type", "Total Spent", "Due"].map((h) => (
                  <div key={h} className={`${CELL} h-[40px] bg-white`}>
                    <span className={`${HEAD} whitespace-nowrap`}>{h}</span>
                  </div>
                ))}
                <div className={`${CELL} h-[40px] justify-center bg-white`}>
                  <span className={`${HEAD} whitespace-nowrap`}>Action</span>
                </div>
              </div>

              <div className="mt-[6px]">
                {rows.length === 0 && loading && (
                  <TableSkeleton columns={GRID} rows={pageSize} />
                )}
                {rows.length === 0 && !loading && (
                  <p className="py-[40px] text-center text-[14px] text-[#525252]">
                    No customers match that search.
                  </p>
                )}
                {rows.map((c, i) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${c.name}`}
                    onClick={() => setDetailOf(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailOf(c);
                      }
                    }}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors outline-none hover:bg-[#fafafa] focus-visible:bg-[#fffaeb] focus-visible:ring-1 focus-visible:ring-[#f5b800] focus-visible:ring-inset ${
                      i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"
                    }`}
                  >
                    <div className={CELL}><span className={`${TEXT} truncate`}>{c.customerId}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate !text-[#1e1e1e]`}>{c.name}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{c.phone}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{c.email ?? "—"}</span></div>
                    <div className={CELL}>
                      <StatusPill label={c.type} tone={TYPE_TONE[c.type] ?? "slate"} />
                    </div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{c.totalSpentFormatted}</span></div>
                    <div className={CELL}>
                      <span className={`${TEXT} truncate ${c.dueAmount > 0 ? "!text-[#e63946]" : ""}`}>
                        {c.dueAmountFormatted}
                      </span>
                    </div>
                    <div
                      className={`${CELL} justify-center`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RowActionMenu
                        label={`Actions for ${c.name}`}
                        actions={[
                          { label: "View customer", onSelect: () => setDetailOf(c) },
                          { label: "Copy phone", onSelect: () => setNote(`${c.phone} copied`) },
                        ]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setDetailOf(c)}
              aria-label={`Open ${c.name}`}
              className="w-full cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] p-[12px] text-left transition-colors hover:bg-[#fafafa]"
            >
              <div className="flex items-start justify-between gap-[10px]">
                <div className="min-w-0">
                  <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{c.name}</p>
                  <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">{c.phone}</p>
                </div>
                <StatusPill label={c.type} tone={TYPE_TONE[c.type] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">{c.customerId}</span>
                <span className={`${TEXT} shrink-0`}>{c.totalSpentFormatted}</span>
              </div>
            </button>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        <div className="mt-[9px]">
          <TablePagination
            page={current}
            pageSize={pageSize}
            total={customers.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={detailOf?.name ?? ""}
        footer={
          <button type="button" className={MODAL_GHOST} onClick={() => setDetailOf(null)}>
            Close
          </button>
        }
      >
        {detailOf && (
          <dl className="flex flex-col gap-[12px]">
            {[
              ["Customer ID", detailOf.customerId],
              ["Phone", detailOf.phone],
              ["Email", detailOf.email ?? "—"],
              ["Orders", String(detailOf.orderCount)],
              ["Total Spent", detailOf.totalSpentFormatted],
              ["Due", detailOf.dueAmountFormatted],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">{k}</dt>
                <dd className="truncate text-[14px] font-medium text-[#1e1e1e]">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-[16px]">
              <dt className="text-[14px] text-[#525252]">Type</dt>
              <dd>
                <StatusPill label={detailOf.type} tone={TYPE_TONE[detailOf.type] ?? "slate"} />
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </div>
  );
}
