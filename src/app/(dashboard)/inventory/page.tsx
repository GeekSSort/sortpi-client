"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InventoryProduct } from "@/types/inventory";
import { InventoryService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import Barcode from "@/components/shared/Barcode";
import { printBarcodeLabels } from "@/lib/printLabels";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import CatalogManagerModal from "@/components/modules/dashboard/CatalogManagerModal";
import type { CatalogKind } from "@/services/inventoryService";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import { useQuery, queryKey, setQueryData, invalidate } from "@/lib/query/useQuery";
import { QueryBoundary, RefreshBar, EmptyState } from "@/components/shared/QueryBoundary";
import ProductImage from "@/components/shared/ProductImage";
import { useProductDiscounts } from "@/lib/usePosDiscounts";
import { priceAfter } from "@/services/discountService";
import { formatMoney } from "@/lib/format";

/**
 * Products — Figma 51:10942.
 *
 * Search on the left of the headline, date and Add New on the right, then a
 * nine-column table: 40px head, 54px rows, pager below.
 *
 * The columns use the design's widths as fr units, so a wider screen shares
 * the extra space instead of piling it into one column.
 */

const STATUS_TONE: Record<InventoryProduct["status"], Tone> = {
  "In Stock": "green",
  "Low Stock": "gold",
  "Out of Stock": "rose",
};

function AddIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="0.9" y="0.9" width="18.2" height="18.2" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.4v7.2M6.4 10h7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="block size-[24px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
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

// #  Product Name  Category  Brand  Price  Stock  SKU  Status  Action
function TagIcon() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M2.25 8.06V3.19c0-.52.42-.94.94-.94h4.87c.25 0 .49.1.66.28l6.56 6.56c.37.37.37.96 0 1.33l-4.87 4.87c-.37.37-.96.37-1.33 0L2.53 8.72a.94.94 0 0 1-.28-.66Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="5.6" cy="5.6" r="1.05" fill="currentColor" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 1.9l2.06 4.3 4.69.63-3.42 3.28.85 4.7L9 12.55l-4.18 2.26.85-4.7L2.25 6.83l4.69-.63L9 1.9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const GRID = "grid-cols-[50fr_210fr_144fr_114fr_130fr_100fr_157fr_140fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function InventoryPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the search term before it reaches the cache key, so
      typing makes one request instead of one per letter — and a slow answer
      for "so" can no longer land on top of the rows for "sony", because it
      belongs to a key that is no longer on screen. */
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [note, setNote] = useState<string | null>(null);
  /** Which lookup list the manage modal is showing, if any. */
  const [managing, setManaging] = useState<CatalogKind | null>(null);
  const [detailOf, setDetailOf] = useState<InventoryProduct | null>(null);
  /** How many stickers to print. A case of 24 wants 24, and printing them one
      at a time is why people give up and write the price on with a marker. */
  const [copies, setCopies] = useState(1);
  /** The rendered label, handed to the print window as finished markup so what
      prints is exactly what was checked on screen. */
  const labelRef = useRef<HTMLDivElement>(null);

  const printLabel = (product: InventoryProduct) => {
    const svg = labelRef.current?.querySelector("svg")?.outerHTML;
    if (!svg) return;
    printBarcodeLabels(
      [
        {
          name: product.name,
          price: product.price > 0 ? product.priceFormatted : undefined,
          svg,
        },
      ],
      copies
    );
  };
  const [deleteOf, setDeleteOf] = useState<InventoryProduct | null>(null);
  const [editOf, setEditOf] = useState<InventoryProduct | null>(null);
  /** `brandId`, not a brand name: the API takes an id, and a shop's brand list
      is the only place those ids come from. */
  const [draft, setDraft] = useState({ name: "", brandId: "", price: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // The till's product offers, so this table shows what a customer is charged
  // rather than a shelf price the POS has already discounted past.
  const rates = useProductDiscounts();

  // The brand list, for the edit dialog's picker. Shared with the add-product
  // form's cache entry, so opening the dialog costs nothing on a page that has
  // already been to Add New.
  const catalog = useQuery(queryKey("inventory", { part: "catalog" }), () =>
    InventoryService.getCatalogOptions()
  );
  const brandOptions = catalog.data?.brands ?? [];

  const openEdit = (r: InventoryProduct) => {
    // The row carries the brand's NAME — it is what the table shows — so the
    // id is looked back up. Brand names are unique per organization, which is
    // what makes that safe.
    const brand = brandOptions.find((b) => b.name === r.brand);
    setDraft({ name: r.name, brandId: brand?.id ?? "", price: String(r.price) });
    setEditError(null);
    setEditOf(r);
  };

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  // One page at a time. The whole list used to be requested and sliced in the
  // browser, but the API caps a page at 200, so anything past that was
  // silently truncated and the pager called 200 the total.
  const key = queryKey("inventory", { page, limit: pageSize, search: term });
  const { data, loading, fetching, error, refetch } = useQuery(key, () =>
    InventoryService.getProducts({ search: term, page, limit: pageSize })
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already sliced. `rows` is the page.
  const rows = data?.data ?? [];

  /**
   * Rewrite this page in the cache.
   *
   * Edit and delete have no endpoint yet, so both are screen-only — but the
   * rows now live in the cache rather than in component state, and patching
   * the entry is what keeps the change visible until the next refetch replaces
   * it with the server's answer.
   */
  const patchRows = (fn: (list: InventoryProduct[]) => InventoryProduct[]) => {
    if (!data) return;
    setQueryData(key, { ...data, data: fn(data.data) });
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 51:10943 */}
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:items-center lg:justify-between lg:gap-0">
        <div className="flex h-[44px] w-full items-center justify-between gap-[12px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:w-[370px]">
          <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by product name, SKU or barcode..."
              aria-label="Search products"
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

        <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
          {/* Categories and brands were read-only from the app: the add-product
              form offered whatever was already there and a shop had no way to
              make its own. They sit here rather than in Settings because this
              is the screen where somebody notices one is missing. */}
          <button
            type="button"
            onClick={() => setManaging("category")}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[12px] bg-white px-[16px] py-[8px] text-[15px] leading-[24px] font-medium whitespace-nowrap text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]"
          >
            <TagIcon />
            Categories
          </button>
          <button
            type="button"
            onClick={() => setManaging("brand")}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[12px] bg-white px-[16px] py-[8px] text-[15px] leading-[24px] font-medium whitespace-nowrap text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]"
          >
            <BrandIcon />
            Brands
          </button>
          <Link
            href="/inventory/add"
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            Add New
          </Link>
        </div>
      </div>

      {/* Table card — 51:10975 */}
      <div className="relative w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <RefreshBar active={fetching} />
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1128px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={HEAD}>#</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Product Name</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Category</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Brand</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Price</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Stock</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Barcode</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Action</span></div>
              </div>

              <div className="mt-[6px]">
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={data !== undefined}
                  skeleton={<TableSkeleton columns={GRID} rows={pageSize} />}
                  errorMessage="Products could not be loaded."
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={term ? "No products match that search." : "No products yet."}
                    hint={term ? undefined : "Add one to get started."}
                  />
                )}
                {rows.map((r, i) => (
                  // The whole row opens the product. A row that only responds
                  // to a 24px menu at its right edge is a row people click and
                  // click again; the menu still has its own actions, and stops
                  // its own clicks from reaching here.
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailOf(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailOf(r);
                      }
                    }}
                    aria-label={`Open ${r.name}`}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors hover:bg-[#fafafa] focus-visible:bg-[#fafafa] focus-visible:outline-none ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={`${CELL} justify-center`}><span className={TEXT}>{r.index}</span></div>
                    {/* 28px thumbnail, 8px from the name — 57:12649 */}
                    <div className={`${CELL} gap-[8px]`}>
                      <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[6px]">
                        <ProductImage src={r.image} alt="" sizes="28px" />
                      </span>
                      <span className={`${TEXT} truncate`}>{r.name}</span>
                    </div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.category}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.brand}</span></div>
                    <div className={CELL}>
                      {(() => {
                        const offer = rates[r.variantId];
                        if (!offer || r.price <= 0) {
                          return <span className={`${TEXT} truncate`}>{r.priceFormatted}</span>;
                        }
                        return (
                          <span className="flex min-w-0 flex-col">
                            <span className={`${TEXT} truncate`}>
                              {formatMoney(priceAfter(r.price, offer), { decimals: 2 })}
                            </span>
                            <span className="truncate text-[11px] leading-[14px] text-[#a3a3a3] line-through">
                              {r.priceFormatted}
                            </span>
                          </span>
                        );
                      })()}
                    </div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.stock}</span></div>
                    <div className={CELL}>
                      {r.barcode ? (
                        <span className="flex min-w-0 flex-col gap-[2px]">
                          <span className="truncate font-mono text-[13px] leading-[16px] tracking-[0.02em] text-[#1e1e1e]">
                            {r.barcode}
                          </span>
                          {/* Small, and without the digits repeated under it —
                              the number is already on the line above. It is
                              here so a shelf label can be recognised against
                              the row it came from. */}
                          <Barcode value={r.barcode} height={18} moduleWidth={1} showText={false} />
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#a3a3a3]">None</span>
                      )}
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
                    </div>
                    <div className={`${CELL} justify-center`} onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu
                        label={`Actions for ${r.sku}`}
                        actions={[
                          { label: "View product", onSelect: () => setDetailOf(r) },
                          { label: "Edit product", onSelect: () => openEdit(r) },
                          { label: "Delete product", onSelect: () => setDeleteOf(r) },
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
          {rows.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetailOf(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDetailOf(r);
                }
              }}
              aria-label={`Open ${r.name}`}
              className="cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] p-[12px] transition-colors hover:bg-[#fafafa] focus-visible:bg-[#fafafa] focus-visible:outline-none"
            >
              <div className="flex items-start justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[6px]">
                    <ProductImage src={r.image} alt="" sizes="28px" />
                  </span>
                  <div className="min-w-0">
                    <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{r.name}</p>
                    <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                      {r.sku} · {r.brand}
                    </p>
                  </div>
                </div>
                <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                  {r.category} · {r.stock} in stock
                </span>
                <span className={`${TEXT} shrink-0`}>
                  {rates[r.variantId] && r.price > 0
                    ? formatMoney(priceAfter(r.price, rates[r.variantId]), { decimals: 2 })
                    : r.priceFormatted}
                </span>
              </div>
            </div>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        {/* Pagination — 51:11401 */}
        <div className="mt-[9px]">
          <TablePagination
            page={current}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* View product */}
      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={detailOf?.name ?? ""}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setDetailOf(null)}>
              Close
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (detailOf) openEdit(detailOf);
                setDetailOf(null);
              }}
            >
              Edit product
            </button>
          </>
        }
      >
        {detailOf && (
          <div className="flex flex-col gap-[16px]">
            <div className="flex items-center gap-[12px]">
              <span className="relative size-[56px] shrink-0 overflow-hidden rounded-[10px] border border-solid border-[#eaeaea]">
                <ProductImage src={detailOf.image} alt="" sizes="56px" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-medium text-[#1e1e1e]">{detailOf.name}</p>
                <p className="truncate text-[13px] text-[#525252]">{detailOf.sku}</p>
              </div>
            </div>
            {/* The label, as it will print. Shown at label size rather than
                thumbnail size so it can be held against the packet and checked
                — a shelf label with the wrong code is a wrong price at the
                till, and the only moment to catch it is before printing. */}
            <div className="flex flex-col items-center gap-[10px] rounded-[10px] bg-white p-[14px] shadow-[inset_0_0_0_1px_#eaeaea]">
              {detailOf.barcode ? (
                <>
                  <div ref={labelRef}>
                    <Barcode value={detailOf.barcode} height={56} moduleWidth={2} />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-[8px]">
                    <label className="flex items-center gap-[6px] text-[13px] text-[#525252]">
                      Copies
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                        className="h-[36px] w-[70px] rounded-[8px] bg-white px-[10px] text-center text-[14px] tabular-nums text-[#1e1e1e] outline-none shadow-[inset_0_0_0_1px_#eaeaea]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => printLabel(detailOf)}
                      className="flex h-[36px] cursor-pointer items-center gap-[6px] rounded-[8px] bg-white px-[14px] text-[13px] font-medium text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]"
                    >
                      Print barcode
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-[#525252]">
                  This product has no barcode yet. Add one under Edit product and it can be
                  scanned and printed.
                </p>
              )}
            </div>

            <dl className="flex flex-col gap-[12px]">
              {[
                ["Category", detailOf.category],
                ["Brand", detailOf.brand],
                ["Price", detailOf.priceFormatted],
                ["Stock", String(detailOf.stock)],
                ["Barcode", detailOf.barcode || "None"],
                ["SKU", detailOf.sku],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-[16px]">
                  <dt className="text-[14px] text-[#525252]">{k}</dt>
                  <dd className="text-[14px] font-medium text-[#1e1e1e]">{v}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">Status</dt>
                <dd>
                  <StatusPill label={detailOf.status} tone={STATUS_TONE[detailOf.status] ?? "slate"} />
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      {/* Delete product */}
      <Modal
        open={deleteOf !== null}
        onClose={() => setDeleteOf(null)}
        title="Delete product"
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setDeleteOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: RED_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (!deleteOf) return;
                // Changed on screen only: there is no delete endpoint yet.
                patchRows((list) => list.filter((x) => x.id !== deleteOf.id));
                setNote(`${deleteOf.name} deleted`);
                setDeleteOf(null);
              }}
            >
              Confirm delete
            </button>
          </>
        }
      >
        {deleteOf && (
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            Delete <span className="font-medium text-[#1e1e1e]">{deleteOf.name}</span> (
            <span className="font-medium text-[#1e1e1e]">{deleteOf.sku}</span>)? This removes it from the
            product list.
          </p>
        )}
      </Modal>

      {/* Edit product — no Figma frame; built in the app's own language. */}
      <Modal
        open={editOf !== null}
        onClose={() => setEditOf(null)}
        title="Edit product"
        width={460}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setEditOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={savingEdit}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={async () => {
                if (!editOf || savingEdit) return;
                const name = draft.name.trim();
                const price = Number(draft.price);
                if (!name) return setEditError("Product name is required.");
                if (!draft.price.trim() || Number.isNaN(price) || price < 0)
                  return setEditError("Enter a valid price.");

                // Two requests, because they are two resources: the product
                // carries its name and brand, the price belongs to the
                // variant. Each is skipped when nothing about it changed.
                const brandChanged =
                  draft.brandId !== (brandOptions.find((b) => b.name === editOf.brand)?.id ?? "");
                const detailsChanged = name !== editOf.name || brandChanged;
                const priceChanged = price !== editOf.price;
                if (!detailsChanged && !priceChanged) {
                  setEditOf(null);
                  return;
                }

                setSavingEdit(true);
                setEditError(null);
                try {
                  if (detailsChanged) {
                    await InventoryService.updateProduct(editOf.id, {
                      name,
                      brandId: draft.brandId || null,
                    });
                  }
                  if (priceChanged) {
                    await InventoryService.setPrice(editOf.id, price);
                  }
                  setNote(`${name} updated`);
                  setEditOf(null);
                  // The same product is a tile on the till, a line on the
                  // stock screen and a figure on the dashboard. Refetched
                  // rather than patched: the API owns what it now says.
                  invalidate("inventory", "stock", "dashboard", "pos-products");
                } catch (err) {
                  // The server names the real problem — a duplicate name, a
                  // missing permission — and that is more use than "try again".
                  setEditError(
                    err instanceof Error && err.message
                      ? err.message
                      : "The changes could not be saved."
                  );
                } finally {
                  setSavingEdit(false);
                }
              }}
            >
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        {editOf && (
          <div className="flex flex-col gap-[14px]">
            <div className="flex items-center gap-[12px]">
              <span className="relative size-[48px] shrink-0 overflow-hidden rounded-[10px] border border-solid border-[#eaeaea]">
                <ProductImage src={editOf.image} alt="" sizes="48px" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] text-[#525252]">{editOf.sku}</p>
                <p className="truncate text-[13px] text-[#525252]">{editOf.category}</p>
              </div>
            </div>

            {[
              { k: "name" as const, label: "Product name", placeholder: "Product name", mode: undefined },
              { k: "price" as const, label: "Price", placeholder: "0", mode: "decimal" as const },
            ].map((f) => (
              <label key={f.k} className="flex flex-col gap-[6px]">
                <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">{f.label}</span>
                <input
                  value={draft[f.k]}
                  inputMode={f.mode}
                  onChange={(e) => {
                    const v = f.mode ? e.target.value.replace(/[^\d.]/g, "") : e.target.value;
                    setDraft((d) => ({ ...d, [f.k]: v }));
                    setEditError(null);
                  }}
                  placeholder={f.placeholder}
                  aria-label={f.label}
                  className="flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
              </label>
            ))}

            {/* A picker, not a text box: the API takes a brand id and a typed
                name resolves to nothing. */}
            <label className="flex flex-col gap-[6px]">
              <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">Brand</span>
              <select
                value={draft.brandId}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, brandId: e.target.value }));
                  setEditError(null);
                }}
                aria-label="Brand"
                className="flex h-[44px] cursor-pointer items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none"
              >
                <option value="">No brand</option>
                {brandOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Stock is a ledger balance, not a field: changing it writes a
                movement against a named warehouse, and this row does not know
                which one. Manage Stock is where that is done. */}
            <div className="flex items-center justify-between gap-[12px] rounded-[10px] bg-[#fafafa] px-[12px] py-[10px]">
              <span className="text-[13px] text-[#525252]">
                Stock: <span className="font-medium text-[#1e1e1e]">{editOf.stock}</span>
              </span>
              <Link
                href="/inventory/stock"
                onClick={() => setEditOf(null)}
                className="text-[13px] font-medium text-[#f5b800] hover:underline"
              >
                Manage stock
              </Link>
            </div>

            <p className="text-[12px] text-[#8a8a8a]">
              Status follows the stock count: 0 is Out of Stock, 10 or fewer is Low Stock.
            </p>
            {editError && <p className="text-[13px] text-[#ef4444]">{editError}</p>}
          </div>
        )}
      </Modal>

      {managing && (
        <CatalogManagerModal
          kind={managing}
          open
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  );
}
