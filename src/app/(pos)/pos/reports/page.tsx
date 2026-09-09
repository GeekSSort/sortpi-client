"use client";

import React, { useMemo, useState } from "react";
import MetricCards from "@/components/modules/dashboard/MetricCards";
import SalesSummaryChart from "@/components/modules/dashboard/SalesSummaryChart";
import ProfitLossChart from "@/components/modules/dashboard/ProfitLossChart";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { MODAL_GHOST } from "@/components/shared/Modal";
import { DashboardService, CustomerService, topSellerTiles } from "@/services";
import { tokenStore } from "@/services/apiClient";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { resolveRange, previousRange, previousLabel, type RangeOption } from "@/lib/range";
import { StatCardsSkeleton, ChartSkeleton, CardGridSkeleton } from "@/components/shared/Skeleton";
import { CardListState, EmptyState, ErrorState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { DashboardResponse, MetricCardData } from "@/types/dashboard";
import { CustomerRecord } from "@/types/customer";
import ProductImage from "@/components/shared/ProductImage";

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

const taka = (n: number) => `৳ ${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Movement between two windows of the same length.
 *
 * The four percentages on this page were literals — 18.6%, 15.3%, 16.7%, 8.4%
 * — printed under an arrow that always pointed up, whatever the shop had done.
 * A figure with no measurement behind it is worse than no figure: it reads
 * exactly like one that was measured.
 *
 * Growth from nothing has no percentage. "New" says that; 100% would claim a
 * doubling of zero.
 */
function movement(now: number, before: number): { trend: string; trendType: "up" | "down" } {
  if (before === 0) {
    return { trend: now > 0 ? "New" : "—", trendType: now < 0 ? "down" : "up" };
  }
  const change = ((now - before) / Math.abs(before)) * 100;
  return {
    trend: `${Math.abs(change).toFixed(1)}%`,
    trendType: change < 0 ? "down" : "up",
  };
}

/** Units sold across a window, which is what the Sales card counts. */
function unitsSold(d: DashboardResponse): number {
  return d.salesSummary.reduce((total, point) => total + point.sales, 0);
}

/**
 * The four figures at the top — 247:8246.
 *
 * `previous` is the window of the same length immediately before this one, so
 * every arrow on this page is a comparison the reader could repeat by changing
 * the range picker.
 */
function branchMetrics(
  d: DashboardResponse,
  previous: DashboardResponse | undefined,
  vsText: string
): MetricCardData[] {
  const cards = [
    {
      id: "today-revenue",
      title: "Today Revenue",
      icon: "revenue" as const,
      now: d.profitLoss.totalRevenue,
      then: previous?.profitLoss.totalRevenue,
    },
    {
      id: "today-sales",
      title: "Today Sales",
      icon: "sales" as const,
      now: unitsSold(d),
      then: previous ? unitsSold(previous) : undefined,
    },
    {
      id: "today-profit",
      title: "Today Profit",
      icon: "orders" as const,
      now: d.profitLoss.netProfit,
      then: previous?.profitLoss.netProfit,
    },
    {
      id: "today-expenses",
      title: "Today Expenses",
      icon: "customers" as const,
      now: d.profitLoss.totalExpenses,
      then: previous?.profitLoss.totalExpenses,
    },
  ];

  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    value: taka(card.now),
    // Undefined while the comparison window is still in flight: an em dash is
    // honest about not knowing yet, where "0.0%" would be a measurement.
    ...(card.then === undefined
      ? { trend: "—", trendType: "up" as const }
      : movement(card.now, card.then)),
    vsText,
    icon: card.icon,
  }));
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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<CustomerRecord | null>(null);

  const branchId = tokenStore.branch();

  // These used to start at a canned dashboard — a named cashier and a revenue
  // figure nobody had earned — so a failed request left invented money on a
  // branch report. Undefined until the server answers; a skeleton until then.
  // Reading the clock during render is impure, and a report should not change
  // what it means at midnight under the person reading it.
  const [today] = useState(() => new Date());
  const [salesRange, setSalesRange] = useState<RangeOption>("This Week");
  const [pnlRange, setPnlRange] = useState<RangeOption>("This Week");
  const salesWindow = useMemo(() => resolveRange(salesRange, today), [salesRange, today]);
  const pnlWindow = useMemo(() => resolveRange(pnlRange, today), [pnlRange, today]);
  // What the arrows on the four figures are measured against.
  const priorWindow = useMemo(() => previousRange(salesWindow), [salesWindow]);

  const {
    data,
    loading: dashLoading,
    fetching: dashFetching,
    error: dashError,
    refetch: refetchDash,
  } = useQuery(
    // Same key the back-office dashboard uses, so the two share one answer
    // instead of asking twice. The branch is part of it because these are the
    // BRANCH figures: two branches are two answers and must not share a slot.
    queryKey("dashboard", { branch: branchId, ...salesWindow }),
    () => DashboardService.getDashboardData(branchId, salesWindow),
    { staleMs: 30_000 }
  );

  // The same bundle for the window before this one. It shares the dashboard's
  // cache key, so moving the picker back and forth costs nothing after the
  // first look, and a failure here only costs the arrows — never the figures.
  const { data: priorData } = useQuery(
    queryKey("dashboard", { branch: branchId, ...priorWindow }),
    () => DashboardService.getDashboardData(branchId, priorWindow),
    { staleMs: 30_000 }
  );

  // The Profit & Loss card asks for its own window, so its picker works here
  // exactly as it does on the back-office dashboard.
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

  // Ten tiles, so the ten best sellers in the window on screen — from
  // /reports/sales/by-product/, joined to the catalogue for the photograph,
  // the shelf price and what is left on it.
  const {
    data: products,
    loading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery(
    queryKey("top-sellers", { branch: branchId, ...salesWindow }),
    () => topSellerTiles({ branchId, ...salesWindow }, 10),
    { staleMs: 60_000 }
  );

  // The search is part of the key, so a slow answer for "ra" can no longer
  // land after "rahman" — the two are separate cache entries.
  const {
    data: customerPage,
    loading: customersLoading,
    fetching: customersFetching,
    error: customersError,
    refetch: refetchCustomers,
  } = useQuery(queryKey("customers", { search: query }), () =>
    CustomerService.getCustomers({ search: query })
  );
  const customers = useMemo(() => customerPage?.data ?? [], [customerPage]);

  const metrics = useMemo(
    () => (data ? branchMetrics(data, priorData, previousLabel(salesRange)) : []),
    [data, priorData, salesRange]
  );

  // Two rows of five, best seller first.
  const topSelling = useMemo(() => products ?? [], [products]);

  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
  const current = Math.min(page, totalPages);
  const rows = useMemo(
    () => customers.slice((current - 1) * pageSize, current * pageSize),
    [customers, current, pageSize]
  );

  return (
    <div className="relative flex w-full flex-col gap-[24px] pb-[24px]">
      <RefreshBar active={dashFetching || customersFetching} />

      <QueryBoundary
        loading={dashLoading}
        error={dashError}
        hasData={data !== undefined}
        skeleton={
          <div className="flex w-full flex-col gap-[24px]">
            <StatCardsSkeleton count={4} />
            <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-[757fr_383fr]">
              <div className="min-w-0 rounded-[12px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea]">
                <ChartSkeleton height={260} />
              </div>
              <div className="min-w-0 rounded-[12px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea]">
                <ChartSkeleton height={260} />
              </div>
            </div>
          </div>
        }
        errorMessage="Could not load the branch figures."
        onRetry={refetchDash}
      >
        {data && (
          <div className="flex w-full flex-col gap-[24px]">
            {/* Branch figures — 247:7663 */}
            <MetricCards metrics={metrics} />

            {/* Sales Summary beside Profit & Loss — 247:7757 / 247:7893 */}
            <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-[757fr_383fr]">
              <div className="min-w-0">
                <SalesSummaryChart
                  data={data.salesSummary}
                  range={salesRange}
                  onRangeChange={setSalesRange}
                  busy={dashFetching}
                />
              </div>
              <div className="min-w-0">
                {pnlData ? (
                  <ProfitLossChart
                    data={pnlData.profitLoss}
                    range={pnlRange}
                    onRangeChange={setPnlRange}
                    busy={pnlFetching}
                  />
                ) : (
                  <div className="flex h-full flex-col rounded-[12px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea]">
                    {pnlError ? (
                      <ErrorState message="Could not load profit &amp; loss." onRetry={refetchPnl} compact />
                    ) : (
                      <ChartSkeleton height={220} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </QueryBoundary>

      {/* Top Selling Product — 247:8060 */}
      <div className="flex w-full flex-col gap-[16px]">
        <h2 className="text-[24px] leading-[1.2] font-medium tracking-[-0.72px] text-[#1e1e1e]">
          Top Selling Product
        </h2>
        <QueryBoundary
          loading={productsLoading}
          error={productsError}
          hasData={products !== undefined}
          skeleton={
            <CardGridSkeleton
              count={10}
              height={68}
              className="grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-[14px]"
            />
          }
          errorMessage="Could not load the product list."
          onRetry={refetchProducts}
        >
        {topSelling.length === 0 ? (
          <EmptyState message="No products in the catalogue yet." compact />
        ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-[14px]">
          {topSelling.map((p) => (
            <div
              key={p.variantId || p.sku}
              className="flex items-center gap-[12px] overflow-clip rounded-[10px] bg-white p-[10px] shadow-[inset_0_0_0_1px_#eaeaea]"
            >
              <span className="relative flex size-[48px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[#fafafa] shadow-[inset_0_0_0_0.3px_#eaeaea]">
                {/* A real product often has no photo, and next/image with an
                    empty src reloads the page. Initials stand in instead. */}
                {p.image ? (
                  <ProductImage src={p.image} alt="" sizes="48px" />
                ) : (
                  <span aria-hidden className="text-[15px] font-semibold text-[#c9c9c9]">
                    {initials(p.name)}
                  </span>
                )}
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
        )}
        </QueryBoundary>
      </div>

      {/* Recent Customer List — 247:8332 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="flex flex-col items-stretch justify-between gap-[12px] px-[16px] pt-[16px] lg:flex-row lg:items-center">
          <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] whitespace-nowrap text-[#1e1e1e]">
            Recent Customer List
          </p>
          <div className="flex h-[44px] w-full items-center justify-between gap-[12px] rounded-[10px] bg-white px-[12px] shadow-[inset_0_0_0_1px_#eaeaea] lg:min-w-[220px] lg:max-w-[370px] lg:flex-1">
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
                <QueryBoundary
                  loading={customersLoading}
                  error={customersError}
                  hasData={customerPage !== undefined}
                  skeleton={<TableSkeleton columns={GRID} rows={pageSize} />}
                  errorMessage="Could not load the customer list."
                  onRetry={refetchCustomers}
                >
                {rows.length === 0 && (
                  // "Nobody matched" and "the server is down" now read
                  // differently; the second is the ErrorState above.
                  <EmptyState
                    message={query ? "No customers match that search." : "No customers yet."}
                    compact
                  />
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
                </QueryBoundary>
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {/* Loading and failure were already answered here; an empty result was
              not, and read as a list still arriving. Same component as every
              other card list now, so the three states cannot drift apart. */}
          <CardListState
            loading={customersLoading}
            error={customersError}
            hasData={customerPage !== undefined}
            isEmpty={rows.length === 0}
            errorMessage="Could not load the customer list."
            emptyMessage={query ? "No customers match that search." : "No customers yet."}
            onRetry={refetchCustomers}
            rows={4}
          />
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

/** First letters of the first two words, standing in for a missing photo. */
function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
