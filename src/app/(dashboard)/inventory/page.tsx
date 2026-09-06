"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { InventoryProduct } from "@/types/inventory";
import { InventoryService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";

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
const GRID = "grid-cols-[50fr_210fr_144fr_114fr_130fr_100fr_157fr_140fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function InventoryPage() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** The debounce is for typing. Waiting 250ms to make the FIRST request
      just adds a quarter second of blank table on reload. */
  const firstLoad = useRef(true);
  /** The API's count of everything matching, not of what this page holds. */
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<InventoryProduct | null>(null);
  const [deleteOf, setDeleteOf] = useState<InventoryProduct | null>(null);
  const [editOf, setEditOf] = useState<InventoryProduct | null>(null);
  const [draft, setDraft] = useState({ name: "", brand: "", price: "", stock: "" });
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = (r: InventoryProduct) => {
    setDraft({ name: r.name, brand: r.brand, price: String(r.price), stock: String(r.stock) });
    setEditError(null);
    setEditOf(r);
  };

  /** Stock decides the status, so it is derived rather than editable. */
  const statusFor = (stock: number): InventoryProduct["status"] =>
    stock === 0 ? "Out of Stock" : stock <= 10 ? "Low Stock" : "In Stock";

  useEffect(() => {
    // Debounced and guarded: a request per keystroke let a slow answer for
    // "so" land after "sony" and repopulate the table with the wrong rows.
    let live = true;
    const id = setTimeout(() => {
      setLoading(true);
      // One page at a time. The whole list used to be requested and sliced in
      // the browser, but the API caps a page at 200, so anything past that was
      // silently truncated and the pager called 200 the total.
      InventoryService.getProducts({ search: query, page, limit: pageSize })
        .then((res) => {
          if (!live) return;
          setProducts(res.data);
          setTotal(res.total);
          setFailed(false);
        })
        .catch(() => live && setFailed(true))
        .finally(() => live && setLoading(false));
    }, firstLoad.current ? 0 : 250);
    firstLoad.current = false;
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already sliced. `rows` is the page.
  const rows = products;

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
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

        <div className="flex shrink-0 items-center gap-[16px]">
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
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
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
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>SKU</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Action</span></div>
              </div>

              <div className="mt-[6px]">
                {rows.length === 0 && loading && (
                  <TableSkeleton columns={GRID} rows={pageSize} />
                )}
                {rows.length === 0 && !loading && (
                  <p className="py-[40px] text-center text-[14px] text-[#525252]">
                    {failed
                      ? "Products could not be loaded. Refresh to try again."
                      : "No products match that search."}
                  </p>
                )}
                {rows.map((r, i) => (
                  <div
                    key={r.id}
                    className={`grid ${GRID} h-[54px] items-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={`${CELL} justify-center`}><span className={TEXT}>{r.index}</span></div>
                    {/* 28px thumbnail, 8px from the name — 57:12649 */}
                    <div className={`${CELL} gap-[8px]`}>
                      <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[6px]">
                        <Image src={r.image || "/placeholder-product.svg"} alt="" fill sizes="28px" className="object-cover" />
                      </span>
                      <span className={`${TEXT} truncate`}>{r.name}</span>
                    </div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.category}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.brand}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.priceFormatted}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.stock}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.sku}</span></div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
                    </div>
                    <div className={`${CELL} justify-center`}>
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
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {rows.map((r) => (
            <div key={r.id} className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]">
              <div className="flex items-start justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[6px]">
                    <Image src={r.image || "/placeholder-product.svg"} alt="" fill sizes="28px" className="object-cover" />
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
                <span className={`${TEXT} shrink-0`}>{r.priceFormatted}</span>
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
                <Image src={detailOf.image || "/placeholder-product.svg"} alt="" fill sizes="56px" className="object-cover" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-medium text-[#1e1e1e]">{detailOf.name}</p>
                <p className="truncate text-[13px] text-[#525252]">{detailOf.sku}</p>
              </div>
            </div>
            <dl className="flex flex-col gap-[12px]">
              {[
                ["Category", detailOf.category],
                ["Brand", detailOf.brand],
                ["Price", detailOf.priceFormatted],
                ["Stock", String(detailOf.stock)],
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
                setProducts((list) => list.filter((x) => x.id !== deleteOf.id));
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
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (!editOf) return;
                const name = draft.name.trim();
                const price = Number(draft.price);
                const stock = Number(draft.stock);
                if (!name) return setEditError("Product name is required.");
                if (!draft.brand.trim()) return setEditError("Brand is required.");
                if (!draft.price.trim() || Number.isNaN(price) || price < 0)
                  return setEditError("Enter a valid price.");
                if (!draft.stock.trim() || Number.isNaN(stock) || stock < 0)
                  return setEditError("Enter a valid stock count.");
                // Changed on screen only: there is no update endpoint yet.
                setProducts((list) =>
                  list.map((x) =>
                    x.id === editOf.id
                      ? {
                          ...x,
                          name,
                          brand: draft.brand.trim(),
                          price,
                          priceFormatted: `৳ ${price.toLocaleString("en-IN")}`,
                          stock,
                          status: statusFor(stock),
                        }
                      : x
                  )
                );
                setNote(`${name} updated`);
                setEditOf(null);
              }}
            >
              Save changes
            </button>
          </>
        }
      >
        {editOf && (
          <div className="flex flex-col gap-[14px]">
            <div className="flex items-center gap-[12px]">
              <span className="relative size-[48px] shrink-0 overflow-hidden rounded-[10px] border border-solid border-[#eaeaea]">
                <Image src={editOf.image || "/placeholder-product.svg"} alt="" fill sizes="48px" className="object-cover" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] text-[#525252]">{editOf.sku}</p>
                <p className="truncate text-[13px] text-[#525252]">{editOf.category}</p>
              </div>
            </div>

            {[
              { k: "name" as const, label: "Product name", placeholder: "Product name", mode: undefined },
              { k: "brand" as const, label: "Brand", placeholder: "Brand", mode: undefined },
              { k: "price" as const, label: "Price", placeholder: "0", mode: "decimal" as const },
              { k: "stock" as const, label: "Stock", placeholder: "0", mode: "numeric" as const },
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

            <p className="text-[12px] text-[#8a8a8a]">
              Status follows the stock count: 0 is Out of Stock, 10 or fewer is Low Stock.
            </p>
            {editError && <p className="text-[13px] text-[#ef4444]">{editError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
