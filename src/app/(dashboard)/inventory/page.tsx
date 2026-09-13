"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InventoryProduct } from "@/types/inventory";
import { InventoryService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import VariantChip from "@/components/shared/VariantChip";
import RowActionMenu from "@/components/shared/RowActionMenu";
import Barcode from "@/components/shared/Barcode";
import { printBarcodeLabels } from "@/lib/printLabels";
import ScrollEnd from "@/components/shared/ScrollEnd";
import FilterDropdown from "@/components/shared/FilterDropdown";
import TableSkeleton from "@/components/shared/TableSkeleton";
import CatalogManagerModal from "@/components/modules/dashboard/CatalogManagerModal";
import type { CatalogKind, ExportScope, ImportReport } from "@/services/inventoryService";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import ProgressModal from "@/components/shared/ProgressModal";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { useSession } from "@/services/useSession";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import ProductImage from "@/components/shared/ProductImage";
import { useProductDiscounts } from "@/lib/usePosDiscounts";
import { priceAfter } from "@/services/discountService";
import { formatMoney } from "@/lib/format";
import {
  ActionButton,
  ActionLink,
  ExportIcon,
  ImportIcon,
  PageToolbar,
  PlusIcon,
  SearchInput,
  TABLE_CARD,
} from "@/components/shared/Toolbar";

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

/**
 * The two shapes an export can take.
 *
 * Module level because it is a fixed table, not state: rebuilding it on every
 * render of a page this size is work for nothing, and it reads as data here.
 */
const EXPORT_OPTIONS: {
  scope: ExportScope;
  name: string;
  what: string;
  use: string;
}[] = [
  {
    scope: "full",
    name: "Everything",
    what: "Name, category, brand, unit, tax, type, SKU, barcode, description, price, cost, reorder level and flags.",
    use: "A full backup, and the template for a bulk add.",
  },
  {
    scope: "simple",
    name: "Just the products",
    what: "Name, category, unit, SKU and price.",
    use: "A short list to read or share — and it still imports back.",
  },
];

export default function InventoryPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the search term before it reaches the cache key, so
      typing makes one request instead of one per letter — and a slow answer
      for "so" can no longer land on top of the rows for "sony", because it
      belongs to a key that is no longer on screen. */
  const [term, setTerm] = useState("");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [note, setNote] = useState<string | null>(null);
  /** Which lookup list the manage modal is showing, if any. */
  const [managing, setManaging] = useState<CatalogKind | null>(null);

  /* ── Import and export ───────────────────────────────────────────────── */
  /**
   * Import is its own permission; export rides `product.view`, which anyone
   * reading this page already holds.
   *
   * Hidden rather than disabled, and hiding is NOT the control — the API
   * refuses it regardless. But a button that opens a dialog, takes a file and
   * then fails is worse than no button, and it is how somebody concludes the
   * product is broken rather than that they lack a permission. Shown while the
   * session is still loading, so it does not appear and vanish.
   */
  const { user: session, loading: sessionLoading } = useSession();
  const mayImport =
    sessionLoading || !session?.permissions?.length
      ? true
      : session.permissions.includes("product.import");

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  /** True while a file is over the drop zone, so it can say it will take it. */
  const [dragging, setDragging] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /**
   * The export dialog, and what it is set to.
   *
   * Export used to be a button that downloaded one fixed file. A shop that
   * wanted a plain list of what it sells got fourteen columns of bookkeeping,
   * and a shop that wanted a backup had no way to know that was what it had.
   * Asking is one click and removes the guess.
   */
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>("full");
  /** Somewhere between 0 and 1 while a long job runs, `null` when none is. */
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);

  /** What the list is currently showing, so the export matches the screen. */
  const exportFilters = { search: term || undefined };

  const runExport = async (scope: ExportScope) => {
    setExporting(true);
    setProgress({ label: "Preparing the file…", value: 0.15 });
    try {
      // The server streams the whole CSV in one response, so there is no real
      // percentage to report. The bar is honest about that: it moves to show
      // the request is alive and completes when the file arrives, rather than
      // inventing a row count nobody is counting.
      setProgress({ label: "Collecting products…", value: 0.55 });
      await InventoryService.exportCsv(exportFilters, { scope });
      setProgress({ label: "Saving…", value: 1 });
      setExportOpen(false);
      setNote(
        scope === "simple"
          ? "Exported the short product list."
          : "Exported the full catalogue."
      );
    } catch (e) {
      setNote(InventoryService.describeFileError(e));
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportFile(null);
    setImportReport(null);
    setImportError(null);
    setDragging(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  /**
   * Take a file from the picker or from a drop, and refuse anything that is
   * not a CSV before it costs a round trip.
   *
   * A new file invalidates the previous report; leaving it up would let
   * somebody commit a run they checked against a DIFFERENT file, which is the
   * one mistake the two-step dialog exists to prevent.
   */
  const chooseFile = (file: File | null | undefined) => {
    setImportReport(null);
    setImportError(null);
    if (!file) {
      setImportFile(null);
      return;
    }
    const looksCsv =
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel" ||
      file.name.toLowerCase().endsWith(".csv");
    if (!looksCsv) {
      setImportFile(null);
      setImportError("That is not a CSV. Export one from this screen to get the right columns.");
      return;
    }
    setImportFile(file);
  };

  /**
   * Check the file, then write it — never the other way round.
   *
   * The dry run is not a preview built from different code: the server runs the
   * real import inside a transaction and rolls it back, so a clean dry run is
   * a promise the real one keeps. That is only worth anything if the screen
   * actually shows the report before committing, which is why this is two
   * steps and not a single "Import" button.
   */
  const runImport = async (dryRun: boolean) => {
    if (!importFile) return;
    setImportBusy(true);
    setImportError(null);
    // The upload is one request and the server answers when the whole run is
    // done, so there is no row count coming back to count against. The bar
    // reports the STAGES it genuinely knows — reading, then writing — and the
    // report that lands names the rows. Inventing "412 of 604" from a timer
    // would be the kind of progress bar that sits at 90% forever.
    setProgress({
      label: dryRun ? "Reading the file…" : "Writing products…",
      value: dryRun ? 0.3 : 0.45,
    });
    try {
      const report = await InventoryService.importCsv(importFile, { dryRun });
      setProgress({ label: dryRun ? "Checked." : "Imported.", value: 1 });
      setImportReport(report);
      if (!dryRun) {
        // A real import changes the catalogue the till prices from and the
        // product list on screen; both read these keys.
        invalidate("inventory", "pos-products", "dashboard");
        setNote(`${report.created} product${report.created === 1 ? "" : "s"} imported.`);
      }
    } catch (e) {
      setImportError(InventoryService.describeFileError(e));
    } finally {
      setImportBusy(false);
      setProgress(null);
    }
  };
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
  const key = queryKey("inventory", { search: term, status, category, brand });
  const {
    rows,
    total,
    loading,
    loadingMore,
    fetching,
    error,
    hasMore,
    sentinelRef,
    refetch,
    patch,
  } = useInfiniteRows(
    key,
    (p, limit) =>
      InventoryService.getProducts({
        search: term,
        status: status || undefined,
        category: category || undefined,
        brand: brand || undefined,
        page: p,
        limit,
      }),
    { pageSize }
  );

  /**
   * Rewrite this page in the cache.
   *
   * Edit and delete have no endpoint yet, so both are screen-only — but the
   * rows now live in the cache rather than in component state, and patching
   * the entry is what keeps the change visible until the next refetch replaces
   * it with the server's answer.
   */
  const patchRows = (fn: (list: InventoryProduct[]) => InventoryProduct[]) => patch(fn);

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 51:10943 */}
      <PageToolbar
        search={
          // WRAPS on a phone. The search box is `w-full` and the filter group
          // beside it is `shrink-0`, so on one line they came to 559px inside
          // 328px — and nothing above them scrolls, so the Brand dropdown was
          // simply unreachable at 360px. Wrapping puts the filters on their own
          // line there and changes nothing from `lg` up, where the search box
          // is capped at 370px and both fit.
          <div className="flex w-full min-w-0 flex-wrap items-center gap-[12px] lg:flex-nowrap lg:flex-1">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by product name, SKU or barcode..."
              label="Search products"
            />

            {/* The filters, beside the search box: a narrowed list has to
                say on screen that it is narrowed. */}
            <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
              <FilterDropdown
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "", label: "Any status" },
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              <FilterDropdown
                label="Category"
                value={category}
                onChange={setCategory}
                options={[
                  { value: "", label: "Any category" },
                  ...(catalog.data?.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <FilterDropdown
                label="Brand"
                value={brand}
                onChange={setBrand}
                options={[
                  { value: "", label: "Any brand" },
                  ...brandOptions.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          </div>
        }
      >
        {/* Categories and brands were read-only from the app: the add-product
            form offered whatever was already there and a shop had no way to
            make its own. They sit here rather than in Settings because this
            is the screen where somebody notices one is missing. */}
        <ActionButton onClick={() => setManaging("category")}>
          <TagIcon />
          Categories
        </ActionButton>
        <ActionButton onClick={() => setManaging("brand")}>
          <BrandIcon />
          Brands
        </ActionButton>
        {/* Import and Export sit either side of nothing by accident: they are
            the two halves of the same job — take the catalogue out, put a
            corrected one back — and they belong beside Add New because that
            is the button somebody reaches for when they have fifty products
            to enter and realise one at a time will not do. */}
        {mayImport && (
          <ActionButton onClick={() => setImportOpen(true)}>
            <ImportIcon />
            Import
          </ActionButton>
        )}
        <ActionButton
          onClick={() => setExportOpen(true)}
          title="Download what is on screen as CSV"
        >
          <ExportIcon />
          {exporting ? "Exporting…" : "Export"}
        </ActionButton>
        <ActionLink href="/inventory/add" variant="primary">
          <PlusIcon />
          Add New
        </ActionLink>
      </PageToolbar>

      {/* Table card — 51:10975 */}
      <div className={TABLE_CARD}>
        <RefreshBar active={fetching} />
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className="min-w-[1128px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip rounded-[6px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]`}>
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
                  hasData={!loading && !error}
                  skeleton={<TableSkeleton columns={GRID} rows={8} />}
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
                      {/* How many SIZES, not which one.
                          This screen is a catalogue of products — one row per
                          variant would triple it to say the same names. But
                          the row's price and SKU are the DEFAULT variant's
                          while its stock is every variant summed, so without
                          this "Coca-Cola · ৳25 · 120 in stock" reads as one
                          thing at one price and is three. The count says the
                          row is a summary; the detail lists them. */}
                      {r.variantCount > 1 && (
                        <VariantChip label={`${r.variantCount} variants`} size="xs" />
                      )}
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
          {/* Below md there is no table, so the boundary around it never
              speaks here. Without this the phone showed one blank card for
              loading, for failure and for an empty list alike. */}
          <CardListState
            loading={loading}
            error={error}
            hasData={!loading && !error}
            isEmpty={rows.length === 0}
            errorMessage="Products could not be loaded."
            emptyMessage={term ? "No products match that search." : "No products yet."}
            onRetry={refetch}
            rows={4}
          />
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
                    <p className="flex min-w-0 items-center gap-[6px]">
                      <span className={`${TEXT} truncate !text-[#1e1e1e]`}>{r.name}</span>
                      {r.variantCount > 1 && (
                        <VariantChip label={`${r.variantCount} variants`} size="xs" />
                      )}
                    </p>
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
          <ScrollEnd
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            shown={rows.length}
            total={total}
            noun="products"
          />
        </div>
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

      {/* Export — ask what to write, rather than guessing.
          One fixed file served both "back this up" and "give me a list of
          what we sell", and it was wrong for one of them every time. Both
          choices are importable: the short one still carries the three
          columns the importer requires, so a smaller file is never a file
          that cannot come back. */}
      <Modal
        open={exportOpen}
        onClose={() => !exporting && setExportOpen(false)}
        title="Export products"
        width={520}
        footer={
          <>
            <button
              type="button"
              className={MODAL_GHOST}
              disabled={exporting}
              onClick={() => setExportOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={exporting}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => runExport(exportScope)}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[10px]">
          {EXPORT_OPTIONS.map((option) => {
            const chosen = exportScope === option.scope;
            return (
              <button
                key={option.scope}
                type="button"
                onClick={() => setExportScope(option.scope)}
                className={`flex cursor-pointer items-start gap-[12px] rounded-[12px] border border-solid p-[14px] text-left transition-colors ${
                  chosen
                    ? "border-[#f5b800] bg-[#fffdf5]"
                    : "border-[#eaeaea] bg-white hover:bg-[#fafafa]"
                }`}
              >
                <span
                  className={`mt-[2px] flex size-[16px] shrink-0 items-center justify-center rounded-full border ${
                    chosen ? "border-[#f5b800]" : "border-[#a3a3a3]"
                  }`}
                >
                  {chosen && <span className="size-[8px] rounded-full bg-[#f5b800]" />}
                </span>
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="text-[15px] font-semibold text-[#1e1e1e]">{option.name}</span>
                  <span className="text-[12px] leading-[1.55] text-[#525252]">{option.what}</span>
                  <span className="text-[12px] leading-[1.55] text-[#8f8d87]">{option.use}</span>
                </span>
              </button>
            );
          })}

          {term && (
            // Export has always followed the screen's filters. Saying so is
            // the difference between a short file and a file somebody thinks
            // is short because the catalogue shrank.
            <p className="rounded-[10px] bg-[#f6f6f4] px-[12px] py-[10px] text-[12px] leading-[1.55] text-[#525252]">
              Only products matching{" "}
              <span className="font-medium text-[#1e1e1e]">{term}</span> will be written — that is
              what is on screen. Clear the search to export everything.
            </p>
          )}
        </div>
      </Modal>

      {/* The bar for the two jobs slow enough to look broken without one. */}
      <ProgressModal
        open={progress !== null}
        title={exporting ? "Exporting products" : "Importing products"}
        label={progress?.label ?? ""}
        value={progress?.value ?? null}
        detail={!exporting && importFile ? importFile.name : undefined}
      />

      {/* Import — check first, then write.
          The dialog stays open on the report because the report IS the point:
          a run that quietly imported and told you afterwards would make the
          dry run decorative. */}
      <Modal
        open={importOpen}
        onClose={closeImport}
        title="Import products"
        width={640}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={closeImport}>
              {importReport && !importReport.dryRun ? "Done" : "Cancel"}
            </button>
            {(!importReport || importReport.dryRun) && (
              <button
                type="button"
                disabled={
                  !importFile ||
                  importBusy ||
                  // A checked file with nothing importable in it: the button
                  // would post a run that creates zero products.
                  (importReport !== null && importReport.valid === 0)
                }
                style={{ backgroundImage: GOLD_GRADIENT }}
                // NOT `Boolean(importReport)` — that is inverted, and the
                // inversion meant the FIRST press wrote to the database with
                // no dry run at all, which is the one thing this dialog exists
                // to prevent. No report yet means check; a report means write.
                onClick={() => runImport(importReport === null)}
              >
                {importBusy
                  ? "Working…"
                  : importReport
                    ? `Import ${importReport.valid} product${importReport.valid === 1 ? "" : "s"}`
                    : "Check the file"}
              </button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            A UTF-8 CSV with a header row. The columns are the ones{" "}
            <button
              type="button"
              onClick={() => runExport("full")}
              className="cursor-pointer font-medium text-[#f5b800] underline underline-offset-2"
            >
              Export
            </button>{" "}
            writes, so the quickest way to a valid file is to export one and
            edit it. Categories, brands, units and taxes are matched BY NAME and
            must already exist.
          </p>

          {/* The file, taken by drop or by click.
              The browser's own file input was what sat here: a grey "Choose
              File" chip and the words "No file chosen", sized and coloured by
              the operating system and by nothing in this app. It also could
              not be dropped on, which is what somebody with a spreadsheet
              already open in another window will try first. */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            onChange={(e) => chooseFile(e.target.files?.[0])}
            className="sr-only"
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!importBusy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (importBusy) return;
              chooseFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center gap-[10px] rounded-[12px] border border-dashed p-[22px] text-center transition-colors ${
              dragging
                ? "border-[#f5b800] bg-[#fffaeb]"
                : importFile
                  ? "border-[#eaeaea] bg-white"
                  : "border-[#e0dfdb] bg-[#fafafa]"
            }`}
          >
            {importFile ? (
              <>
                <span className="flex size-[38px] items-center justify-center rounded-[10px] bg-[#fffaeb]">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d="M11.5 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Z"
                      stroke="#b58600"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path d="M11.5 2.5v4h4" stroke="#b58600" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="flex flex-col gap-[2px]">
                  <span className="max-w-[380px] truncate text-[14px] font-semibold text-[#1e1e1e]">
                    {importFile.name}
                  </span>
                  <span className="text-[12px] text-[#8f8d87]">
                    {importFile.size < 1024
                      ? `${importFile.size} bytes`
                      : `${(importFile.size / 1024).toFixed(1)} KB`}
                  </span>
                </span>
                <div className="flex items-center gap-[8px]">
                  <button
                    type="button"
                    disabled={importBusy}
                    onClick={() => fileRef.current?.click()}
                    className="cursor-pointer rounded-[8px] bg-white px-[12px] py-[6px] text-[13px] font-medium text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Choose another
                  </button>
                  <button
                    type="button"
                    disabled={importBusy}
                    onClick={() => {
                      chooseFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="cursor-pointer rounded-[8px] px-[12px] py-[6px] text-[13px] font-medium text-[#a02620] transition-colors hover:bg-[#fdeceb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="flex size-[42px] items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d="M10 13.5V4m0 0L6.5 7.5M10 4l3.5 3.5"
                      stroke="#8f8d87"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M3.5 13v1.5A1.5 1.5 0 0 0 5 16h10a1.5 1.5 0 0 0 1.5-1.5V13"
                      stroke="#8f8d87"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[14px] font-semibold text-[#1e1e1e]">
                    {dragging ? "Drop it here" : "Drag a CSV here"}
                  </span>
                  <span className="text-[12px] text-[#8f8d87]">or pick one from your computer</span>
                </span>
                <button
                  type="button"
                  disabled={importBusy}
                  onClick={() => fileRef.current?.click()}
                  className="cursor-pointer rounded-[9px] bg-white px-[14px] py-[7px] text-[13px] font-semibold text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Choose a file
                </button>
              </>
            )}
          </div>

          {importReport && (
            <div className="flex flex-col gap-[10px]">
              <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[4px] text-[13px]">
                <span className="text-[#525252]">
                  {importReport.total} row{importReport.total === 1 ? "" : "s"} read
                </span>
                <span className="font-medium text-[#16a34a]">
                  {importReport.dryRun ? importReport.valid : importReport.created}{" "}
                  {importReport.dryRun ? "ready" : "imported"}
                </span>
                {importReport.failed > 0 && (
                  <span className="font-medium text-[#e63946]">
                    {importReport.failed} to fix
                  </span>
                )}
              </div>

              {importReport.failed > 0 && (
                <div className="flex max-h-[220px] flex-col gap-[6px] overflow-y-auto rounded-[10px] border border-solid border-[#eaeaea] p-[10px]">
                  {importReport.rows
                    .filter((row) => row.status === "error")
                    .map((row) => (
                      <p key={row.line} className="text-[12px] leading-[1.5] text-[#525252]">
                        <span className="font-medium text-[#1e1e1e]">Line {row.line}</span>
                        {row.name ? ` · ${row.name}` : ""} — {row.message}
                      </p>
                    ))}
                </div>
              )}

              {importReport.dryRun && importReport.failed > 0 && (
                <p className="text-[12px] leading-[1.5] text-[#8f8d87]">
                  Importing now writes the {importReport.valid} that are ready and
                  skips the rest. Nothing has been written yet.
                </p>
              )}
            </div>
          )}

          {importError && (
            <p
              role="alert"
              className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
            >
              {importError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
