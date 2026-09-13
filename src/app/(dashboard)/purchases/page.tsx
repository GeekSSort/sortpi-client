"use client";

import React, { useEffect, useState } from "react";
import { PurchaseRecord } from "@/types/purchases";
import { PurchaseService, SupplierService, TransferService } from "@/services";
import PurchaseImport from "@/components/modules/purchases/PurchaseImport";
import { useSession } from "@/services/useSession";
import type { PurchaseImportReport } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import FilterDropdown from "@/components/shared/FilterDropdown";
import DateFilter, { ALL_DATES, DateValue, resolveDates } from "@/components/shared/DateFilter";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, EmptyState, ErrorState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { DetailSkeleton } from "@/components/shared/Skeleton";
import Receipt from "@/components/shared/Receipt";
import { useShopProfile } from "@/components/shared/useShopProfile";
import { formatMoney } from "@/lib/format";
import { clampTypedAmount } from "@/lib/money";
import { AmountLabel } from "@/components/shared/MaxButton";
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
 * Figma: SortPi — Purchase History 59:15218.
 *
 * Search left, date field and Add New right; an 898px card
 * with the 1128-wide eight-column table (40px head, 54px rows) over the 64px
 * pagination bar.
 */

const PAYMENT_TONE: Record<PurchaseRecord["paymentStatus"], Tone> = {
  Paid: "green",
  Due: "gold",
  // Not drawn in the design; same construction, amber.
  Partial: "amber",
};

const STATUS_TONE: Record<PurchaseRecord["status"], Tone> = {
  Received: "green",
  Pending: "gold",
  Ordered: "slate",
  Cancelled: "rose",
};


// Purchase ID  Supplier  Purchase Date  Items  Total Amount  Received  Due  Payment Status  Action
// Two more tracks than the design has: Received and Due sit beside Total, so a
// buyer can see what is still owed without opening every row. Narrower than
// Total because they are the same magnitude and read as a group.
/**
 * Pay against one order, from the row.
 *
 * The figure shown is what is still owed. Typing a smaller one and pressing the
 * tick records a part payment; nothing is sent until that tick, because this
 * moves money against a supplier ledger and a stray keystroke should not.
 * Escape puts the row back.
 *
 * Modelled on the stock screen's count control, and for the same reason: the
 * number is typed where the number already is.
 */
function DueCell({
  row,
  busy,
  editable,
  onPay,
}: {
  row: PurchaseRecord;
  busy: boolean;
  editable: boolean;
  onPay: (amount: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // A refetch after paying brings a new `dueAmount`; drop the draft so the row
  // shows the server's figure rather than the one just typed. Adjusted during
  // render, not in an effect — an effect would paint the stale draft once.
  const [seenDue, setSeenDue] = useState(row.dueAmount);
  if (seenDue !== row.dueAmount) {
    setSeenDue(row.dueAmount);
    setDraft(null);
  }

  if (!editable) {
    return (
      <span className={`${TEXT} truncate ${row.dueAmount > 0 ? "!text-[#e63946]" : ""}`}>
        {row.dueAmountFormatted}
      </span>
    );
  }

  const amount = Number(draft ?? "");
  const ready = draft !== null && Number.isFinite(amount) && amount > 0 && amount <= row.dueAmount;

  return (
    <div className="flex min-w-0 items-center gap-[6px]">
      <input
        value={draft ?? row.dueAmountFormatted}
        onFocus={() => setDraft((d) => d ?? String(row.dueAmount))}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) onPay(amount);
          if (e.key === "Escape") setDraft(null);
        }}
        onBlur={() => window.setTimeout(() => setDraft((d) => (ready ? d : null)), 130)}
        disabled={busy}
        inputMode="decimal"
        aria-label={`Pay against ${row.purchaseId}`}
        title="Type an amount to record a payment"
        className={`h-[30px] w-full min-w-0 rounded-[7px] bg-transparent px-[6px] text-[14px] tabular-nums outline-none disabled:opacity-50 ${
          draft !== null
            ? "bg-white text-[#1e1e1e] shadow-[inset_0_0_0_1.5px_#f5b800]"
            : "text-[#e63946] hover:shadow-[inset_0_0_0_1px_#eaeaea]"
        }`}
      />
      {/* Only once the number is one the API will take: an always-on tick
          invites a click that records nothing. */}
      {ready && (
        <button
          type="button"
          onClick={() => onPay(amount)}
          disabled={busy}
          aria-label={`Record a payment of ${amount} on ${row.purchaseId}`}
          className="sp-fade flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] bg-[#f5b800] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <span className="size-[10px] animate-pulse rounded-full bg-white" />
          ) : (
            <svg className="block size-[13px]" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3.5 8.5l3 3 6-6.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Nine tracks, not ten.
 *
 * The ORDER state — Received, Ordered, Pending, Cancelled — no longer has a
 * column of its own: two pill columns side by side read as one confusing
 * thing, and the question a buyer scans this table for is what is still owed.
 * It has not gone anywhere — the Status filter above the table still narrows
 * by it, the row's own menu still acts on it, and the detail modal states it
 * in full.
 */
const GRID =
  "grid-cols-[158fr_210fr_136fr_90fr_130fr_130fr_130fr_140fr_86fr]";
/** The same glyph the Sales list exports under — one action, one mark. */
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

/** An invoice states the money to the paisa; whole taka hides a 25p line. */
const MONEY = { decimals: 2 } as const;

export default function PurchasesPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key, so typing
      makes one request rather than one per letter — and a slow answer for "PO"
      can no longer land on top of the rows for "PO-12". */
  const [term, setTerm] = useState("");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const [status, setStatus] = useState("");
  const [dates, setDates] = useState<DateValue>(ALL_DATES);
  const [note, setNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [detailOf, setDetailOf] = useState<PurchaseRecord | null>(null);
  const [receiptOf, setReceiptOf] = useState<PurchaseRecord | null>(null);

  const { shop } = useShopProfile();

  // Only while the order is open on screen; the list must not fetch a detail
  // per row.
  const {
    data: purchaseDetail,
    loading: purchaseDetailLoading,
    refetch: refetchPurchase,
  } = useQuery(
    queryKey("purchases", { detail: receiptOf?.id ?? "none" }),
    () => PurchaseService.getPurchase(receiptOf!.id),
    { enabled: receiptOf !== null }
  );
  /** The draft being edited in the detail dialog, or null while it is read. */
  const [edit, setEdit] = useState<{
    supplierId: string;
    purchaseDate: string;
    invoiceNo: string;
    lines: { variantId: string; name: string; sku: string; quantity: number; unitCost: string }[];
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // The lines behind the open detail dialog. The list row carries a count and
  // a total; what is actually ON the order needs the detail endpoint.
  const openDetail = useQuery(
    queryKey("purchases", { detail: detailOf?.id ?? "none" }),
    () => PurchaseService.getPurchase(detailOf!.id),
    { enabled: detailOf !== null }
  );

  /**
   * The CSV import, and the header a file of items has to hang off.
   *
   * The file is item lines ONLY — no supplier, no date — which is what lets
   * the same file be used from the Add Purchase screen, where those come from
   * the form. So this dialog collects them itself and then posts the resolved
   * lines to the SAME `POST /purchases/` the Add screen uses.
   */
  const [importOpen, setImportOpen] = useState(false);
  const [importSupplier, setImportSupplier] = useState("");
  const [importWarehouse, setImportWarehouse] = useState("");
  const [importDate, setImportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [importInvoice, setImportInvoice] = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [importDone, setImportDone] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Suppliers, only once a draft is being edited — the list screen has no other
  // use for them.
  const suppliers = useQuery(
    queryKey("suppliers", { limit: 200 }),
    () => SupplierService.getSuppliers({ limit: 200 }),
    { enabled: edit !== null || importOpen }
  );

  // Where the goods will land. Only while the import dialog is open — the list
  // has no other use for them.
  const session = useSession();
  const warehouseQuery = useQuery(queryKey("warehouses"), () => TransferService.getWarehouses(), {
    enabled: importOpen,
  });
  const importWarehouses = React.useMemo(() => {
    const all = warehouseQuery.data ?? [];
    const branchId = session.user?.activeBranch?.id ?? "";
    // The branch being worked in, when there is one. A buyer who has switched
    // branch is ordering FOR that branch, and offering every warehouse in the
    // company is offering a mistake.
    const here = branchId ? all.filter((w) => w.branchId === branchId) : all;
    return here.length > 0 ? here : all;
  }, [warehouseQuery.data, session.user?.activeBranch?.id]);

  /** One warehouse and no choice to make: pick it rather than ask. */
  const chosenWarehouse =
    importWarehouse || (importWarehouses.length === 1 ? importWarehouses[0].id : "");
  const importReady = Boolean(importSupplier && chosenWarehouse && importDate);

  /**
   * Turn the resolved lines into a purchase.
   *
   * `PurchaseService.createPurchase` — the SAME call the Add Purchase screen
   * makes. The import resolved the file into lines and created whatever the
   * shop was missing; raising the order is the path that was already there,
   * so the draft, its totals and everything downstream behave identically to
   * one typed in by hand.
   */
  const savePurchase = async (report: PurchaseImportReport) => {
    setImportSaving(true);
    setImportError(null);
    try {
      const saved = await PurchaseService.createPurchase({
        referenceNo: `PO-${Date.now()}`,
        supplierId: importSupplier,
        branchId: session.user?.activeBranch?.id ?? "",
        warehouseId: chosenWarehouse,
        purchaseDate: importDate,
        ...(importInvoice.trim() ? { supplierInvoiceNo: importInvoice.trim() } : {}),
        items: report.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          ...(line.taxRate > 0 ? { taxRate: line.taxRate } : {}),
        })),
      });
      const made = report.newProducts + report.newVariants;
      setImportDone(
        `${saved.purchaseId} saved as a draft with ${report.valid} item${
          report.valid === 1 ? "" : "s"
        }` + (made ? `, and ${made} new to your shop` : "") + "."
      );
      invalidate("purchases", "products", "inventory");
    } catch (error) {
      setImportError(
        error instanceof Error && error.message
          ? error.message
          : "The order could not be saved. Check the details above and try again."
      );
    } finally {
      setImportSaving(false);
    }
  };

  const [markOf, setMarkOf] = useState<{ row: PurchaseRecord; kind: "received" | "paid" } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  /** Which row is mid-payment, so only that one's control locks. */
  const [payingId, setPayingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  // The day and the page go to the API, and both are part of the key. They
  // used to be applied in the browser over one capped page, so an older day
  // found nothing that had not already been fetched and the pager called 200
  // the total.
  const span = resolveDates(dates);
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
  } = useInfiniteRows(
    // Primitives only: queryKey stringifies with String(), so an object key
    // stops changing when its contents do.
    queryKey("purchases", { search: term, from: span.from, to: span.to, status }),
    (p, limit) =>
      PurchaseService.getPurchases({
        search: term,
        startDate: span.from,
        endDate: span.to,
        status: status || undefined,
        page: p,
        limit,
      }),
    { pageSize }
  );

  /**
   * Pay against one order, from its Due cell.
   *
   * The same endpoint the Record payment dialog uses. Refetched rather than
   * patched: the supplier ledger owns the balance, and the figure this row
   * shows next has to be the one the server now holds.
   */
  /** A field is safe in a CSV only once quotes are doubled and it is wrapped:
      a supplier called "Rahman, Md." split one row into two columns. */
  const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  /**
   * The rows on screen, as a spreadsheet — the same action the Sales list has.
   *
   * What the FILTERS left, not the whole ledger: an export that ignored the
   * status and the dates would hand back something other than the list the
   * person was looking at when they pressed it.
   *
   * The money columns go out as numbers rather than the formatted strings, so
   * a spreadsheet can total the Due column instead of receiving text.
   */
  const exportCsv = async () => {
    setExporting(true);
    setNote(null);
    try {
      const head = [
        "Purchase ID",
        "Date",
        "Supplier",
        "Items",
        "Total Amount",
        "Paid",
        "Due",
        "Payment Status",
        "Status",
      ];
      const csv = [
        head,
        ...rows.map((r) => [
          r.purchaseId,
          r.purchaseDate,
          r.supplier.name,
          r.itemsCount,
          r.totalAmount,
          r.paidAmount,
          r.dueAmount,
          r.paymentStatus,
          r.status,
        ]),
      ]
        .map((line) => line.map(csvCell).join(","))
        .join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "purchases.csv";
      a.click();
      URL.revokeObjectURL(url);
      setNote(`Exported ${rows.length} purchase${rows.length === 1 ? "" : "s"} on this page`);
    } catch {
      setNote("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const payInline = async (row: PurchaseRecord, amount: number) => {
    if (payingId) return;
    setPayingId(row.id);
    setNote(null);
    try {
      await PurchaseService.recordPayment(row.id, amount);
      setNote(`${formatMoney(amount)} paid on ${row.purchaseId}`);
      // A payment moves the supplier's balance and the money the dashboard
      // counts, not just this row.
      invalidate("purchases", "suppliers", "dashboard");
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? `${row.purchaseId}: ${err.message}`
          : `${row.purchaseId}: that payment could not be recorded.`
      );
    } finally {
      setPayingId(null);
    }
  };

  /** Only a DRAFT. After confirmation the supplier ledger has been posted
      against these figures, and the API refuses an edit — corrections are
      returns. */
  const editable = detailOf?.rawStatus === "DRAFT";

  const startEdit = () => {
    const loaded = openDetail.data;
    if (!detailOf || !loaded) return;
    setEdit({
      supplierId: detailOf.supplierId,
      purchaseDate: loaded.purchaseDate,
      invoiceNo: loaded.supplierInvoiceNo,
      lines: loaded.items.map((l) => ({
        variantId: l.variantId,
        name: l.variantLabel ? `${l.name} ${l.variantLabel}` : l.name,
        sku: l.sku,
        quantity: l.quantity,
        unitCost: String(l.unitCost),
      })),
    });
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!detailOf || !edit || savingEdit) return;
    if (!edit.supplierId) return setEditError("Pick a supplier.");
    if (!edit.purchaseDate) return setEditError("Pick a purchase date.");
    if (edit.lines.length === 0) return setEditError("An order needs at least one line.");
    const empty = edit.lines.find((l) => l.quantity <= 0);
    if (empty) return setEditError(`Enter a quantity for ${empty.name}.`);
    const uncosted = edit.lines.find((l) => !(Number(l.unitCost) > 0));
    if (uncosted) return setEditError(`Enter what ${uncosted.name} costs.`);

    setSavingEdit(true);
    setEditError(null);
    try {
      await PurchaseService.updatePurchase(detailOf.id, {
        supplierId: edit.supplierId,
        purchaseDate: edit.purchaseDate,
        supplierInvoiceNo: edit.invoiceNo.trim(),
        // Every line it should still have: the service REPLACES the set.
        items: edit.lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitCost: Number(l.unitCost),
        })),
      });
      setNote(`${detailOf.purchaseId} updated`);
      setEdit(null);
      setDetailOf(null);
      // The totals are recomputed server-side, so the row, the supplier's
      // balance and the dashboard all move together.
      invalidate("purchases", "suppliers", "dashboard");
    } catch (err) {
      setEditError(
        err instanceof Error && err.message ? err.message : "The changes could not be saved."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  /** DRAFT -> CONFIRMED. The order is placed; nothing has arrived yet. */
  const confirmOrder = async (row: PurchaseRecord) => {
    if (working) return;
    setWorking(true);
    try {
      await PurchaseService.confirm(row.id);
      setNote(`${row.purchaseId} confirmed`);
      // No stock has arrived, but the supplier is owed the money from this
      // moment — so the supplier balances and the dashboard's purchase totals
      // move with it. Both ride the cascade in lib/query/store.ts.
      invalidate("purchases");
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? `${row.purchaseId}: ${err.message}`
          : `${row.purchaseId} could not be confirmed.`
      );
    } finally {
      setWorking(false);
    }
  };

  const cancelOrder = async (row: PurchaseRecord) => {
    if (working) return;
    setWorking(true);
    try {
      await PurchaseService.cancel(row.id);
      setNote(`${row.purchaseId} cancelled`);
      invalidate("purchases");
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? `${row.purchaseId}: ${err.message}`
          : `${row.purchaseId} could not be cancelled.`
      );
    } finally {
      setWorking(false);
    }
  };

  /**
   * Receiving books the goods in and moves stock; paying posts to the supplier
   * ledger. Both are real endpoints — this screen used to change the row and
   * nothing else, so an order could read Received with no stock behind it.
   */
  const applyMark = async () => {
    if (!markOf || working) return;
    setWorking(true);
    setMarkError(null);
    try {
      if (markOf.kind === "received") {
        // No lines: everything still outstanding arrives.
        await PurchaseService.receive(markOf.row.id);
        setNote(`${markOf.row.purchaseId} received — stock booked in`);
      } else {
        const amount = Number(payAmount);
        if (!payAmount.trim() || Number.isNaN(amount) || amount <= 0) {
          setWorking(false);
          return setMarkError("Enter an amount greater than zero.");
        }
        await PurchaseService.recordPayment(markOf.row.id, amount);
        setNote(`৳ ${amount.toLocaleString("en-IN")} paid on ${markOf.row.purchaseId}`);
      }
      setMarkOf(null);
      setPayAmount("");
      // Refetch rather than patch: the ledger owns these numbers. Receiving
      // books goods in, so Stock and the Products list move with it; paying
      // moves the supplier's balance and the dashboard's expense figures.
      invalidate("purchases", "suppliers", "stock", "inventory", "dashboard");
    } catch (err) {
      setMarkError(
        err instanceof Error && err.message ? err.message : "That could not be recorded."
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 59:15220 */}
      <PageToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by Purchase ID or Supplier..."
            label="Search purchases"
          />
        }
      >
        <FilterDropdown
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Any status" },
            { value: "RECEIVED", label: "Received" },
            { value: "CONFIRMED", label: "Ordered" },
            { value: "PARTIAL", label: "Partly received" },
            { value: "DRAFT", label: "Draft" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
        <DateFilter value={dates} onChange={setDates} />
        <ActionButton onClick={exportCsv} disabled={exporting || rows.length === 0}>
          <ExportIcon />
          Export
        </ActionButton>
        {/* Import. Beside Export, because the two are the same job in
            opposite directions and a shop looking for one looks here for
            the other. */}
        <ActionButton
          onClick={() => {
            setImportOpen(true);
            setImportDone(null);
            setImportError(null);
          }}
        >
          <ImportIcon />
          Import
        </ActionButton>
        {/* The same Add New the other list screens carry. This one had no way
            at all to raise a purchase order — the API has had POST /purchases
            since the module was built and nothing in the app called it. */}
        <ActionLink href="/purchases/add" variant="primary">
          <PlusIcon />
          Add New
        </ActionLink>
      </PageToolbar>

      {/* Table card — 59:15252 */}
      <div className={TABLE_CARD}>
        <RefreshBar active={fetching} />
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            {/* One more column than the design — Received and Due sit beside
                Total, and the order-state pill has gone — so the table still
                needs the room. It scrolls sideways inside its card rather than
                squeezing nine tracks into 1128px and truncating every one. */}
            <div className="min-w-[1210px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip rounded-[6px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Purchase ID</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Supplier</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Purchase Date</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Items</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Total Amount</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Received</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Due</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Payment Status</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Action</span></div>
              </div>

              <div className="mt-[6px]">
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={!loading && !error}
                  skeleton={<TableSkeleton columns={GRID} rows={8} />}
                  errorMessage="Purchases could not be loaded."
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={
                      term || dates.mode !== "all"
                        ? "No purchases match that search or date."
                        : "No purchases yet."
                    }
                    hint={term || dates.mode !== "all" ? undefined : "Orders raised with a supplier show up here."}
                  />
                )}
                {rows.map((r, i) => (
                  // Not a <button>: the Action cell holds one, and buttons can't nest.
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${r.purchaseId}`}
                    onClick={() => setDetailOf(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailOf(r);
                      }
                    }}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors outline-none hover:bg-[#fafafa] focus-visible:bg-[#fffaeb] focus-visible:ring-1 focus-visible:ring-[#f5b800] focus-visible:ring-inset ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.purchaseId}</span></div>
                    {/* 28px avatar, 8px from the name — 59:15334 */}
                    <div className={`${CELL} gap-[8px]`}>
                      <Avatar name={r.supplier.name} src={r.supplier.avatar} />
                      <span className={`${TEXT} truncate`}>{r.supplier.name}</span>
                    </div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.purchaseDate}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.itemsCount}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.totalAmountFormatted}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.paidAmountFormatted}</span></div>
                    {/* Typed against, not just read. Red only when something is
                        actually outstanding — a settled purchase showing a red
                        zero is noise. */}
                    <div className={CELL}>
                      <DueCell
                        row={r}
                        busy={payingId === r.id}
                        // Nothing to pay on a cancelled order, and nothing owed
                        // on a settled one.
                        editable={r.dueAmount > 0 && r.status !== "Cancelled"}
                        onPay={(amount) => payInline(r, amount)}
                      />
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={r.paymentStatus} tone={PAYMENT_TONE[r.paymentStatus] ?? "slate"} />
                    </div>
                    {/* The menu lives inside the row hit area — keep its clicks to itself. */}
                    <div
                      className={`${CELL} justify-center`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RowActionMenu
                        label={`Actions for ${r.purchaseId}`}
                        actions={[
                          { label: "View purchase", onSelect: () => setDetailOf(r) },
                          { label: "Print order", onSelect: () => setReceiptOf(r) },
                          // An order is placed before it arrives. Confirming is
                          // its own step on the API and had no way in here.
                          ...(r.status === "Pending"
                            ? [{ label: "Confirm order", onSelect: () => confirmOrder(r) }]
                            : []),
                          ...(r.status === "Received" || r.status === "Cancelled"
                            ? []
                            : [{ label: "Receive goods", onSelect: () => setMarkOf({ row: r, kind: "received" as const }) }]),
                          ...(r.paymentStatus === "Paid" || r.status === "Cancelled"
                            ? []
                            : [
                                {
                                  label: "Record payment",
                                  onSelect: () => {
                                    setPayAmount("");
                                    setMarkError(null);
                                    setMarkOf({ row: r, kind: "paid" as const });
                                  },
                                },
                              ]),
                          ...(r.status === "Received" || r.status === "Cancelled"
                            ? []
                            : [{ label: "Cancel order", onSelect: () => cancelOrder(r) }]),
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

        {/* Stacked cards below md — also tappable */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {/* Below md there is no table, so the boundary around it never
              speaks here. Without this the phone showed one blank card for
              loading, for failure and for an empty list alike. */}
          <CardListState
            loading={loading}
            error={error}
            hasData={!loading && !error}
            isEmpty={rows.length === 0}
            errorMessage="Purchases could not be loaded."
            emptyMessage={term || dates.mode !== "all" ? "No purchases match that search or date." : "No purchases yet."}
            onRetry={refetch}
            rows={4}
          />
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setDetailOf(r)}
              aria-label={`Open ${r.purchaseId}`}
              className="w-full cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] p-[12px] text-left transition-colors outline-none hover:bg-[#fafafa] focus-visible:border-[#f5b800] focus-visible:bg-[#fffaeb]"
            >
              <div className="flex items-start justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <Avatar name={r.supplier.name} src={r.supplier.avatar} />
                  <div className="min-w-0">
                    <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{r.supplier.name}</p>
                    <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                      {r.purchaseId}
                    </p>
                  </div>
                </div>
                <StatusPill label={r.paymentStatus} tone={PAYMENT_TONE[r.paymentStatus] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                  {r.purchaseDate} · {r.itemsCount} items
                </span>
                <span className={`${TEXT} shrink-0`}>{r.totalAmountFormatted}</span>
              </div>
              {/* The same two figures the wide table gained. A phone has no
                  room for three money columns, so they read as a sentence. */}
              <p className="mt-[6px] text-[12px] tracking-[-0.24px] text-[#525252]">
                {r.paidAmountFormatted} received
                {r.dueAmount > 0 && (
                  <span className="font-medium text-[#e63946]"> · {r.dueAmountFormatted} due</span>
                )}
              </p>
            </button>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        {/* Pagination — 59:15704 */}
        <div className="mt-[9px]">
          <ScrollEnd
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            shown={rows.length}
            total={total}
            noun="purchases"
          />
        </div>
        </div>
      </div>

      {/* View purchase */}
      <Modal
        open={detailOf !== null}
        onClose={() => {
          setDetailOf(null);
          setEdit(null);
        }}
        title={`Purchase ${detailOf?.purchaseId ?? ""}`}
        width={560}
        footer={
          edit ? (
            <>
              <button type="button" className={MODAL_GHOST} onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                style={{ backgroundImage: GOLD_GRADIENT }}
                className={MODAL_PRIMARY}
                onClick={() => void saveEdit()}
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={MODAL_GHOST}
                onClick={() => {
                  setDetailOf(null);
                  setEdit(null);
                }}
              >
                Close
              </button>
              {/* Only a draft can be edited — the API refuses the rest, so
                  offering the button would be offering a 409. */}
              {editable && (
                <button
                  type="button"
                  disabled={!openDetail.data}
                  className={MODAL_GHOST}
                  onClick={startEdit}
                >
                  Edit order
                </button>
              )}
              <button
                type="button"
                style={{ backgroundImage: GOLD_GRADIENT }}
                className={MODAL_PRIMARY}
                onClick={() => {
                  setReceiptOf(detailOf);
                  setDetailOf(null);
                }}
              >
                Print order
              </button>
            </>
          )
        }
      >
        {detailOf && (
          <div className="flex flex-col gap-[16px]">
            <div className="flex items-center gap-[12px]">
              <Avatar name={detailOf.supplier.name} src={detailOf.supplier.avatar} size={48} radius={10} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-medium text-[#1e1e1e]">{detailOf.supplier.name}</p>
                <p className="truncate text-[13px] text-[#525252]">{detailOf.purchaseId}</p>
              </div>
            </div>
            <dl className="flex flex-col gap-[12px]">
              {[
                ["Purchase Date", detailOf.purchaseDate],
                ["Items", String(detailOf.itemsCount)],
                ["Total Amount", detailOf.totalAmountFormatted],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-[16px]">
                  <dt className="text-[14px] text-[#525252]">{k}</dt>
                  <dd className="text-[14px] font-medium text-[#1e1e1e]">{v}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">Payment Status</dt>
                <dd>
                  <StatusPill label={detailOf.paymentStatus} tone={PAYMENT_TONE[detailOf.paymentStatus] ?? "slate"} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">Status</dt>
                <dd>
                  <StatusPill label={detailOf.status} tone={STATUS_TONE[detailOf.status] ?? "slate"} />
                </dd>
              </div>
            </dl>

            {/* What is actually ON the order. The dialog showed a count and a
                total, which is the table's summary again — it never said which
                products, and that is the question somebody opens an order to
                answer. */}
            <div className="flex flex-col gap-[8px]">
              <p className="text-[14px] font-medium text-[#525252]">Products</p>
              <div className="overflow-hidden rounded-[10px] border border-solid border-[#eaeaea]">
                <div className="flex items-center gap-[8px] border-b border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[8px]">
                  <span className="min-w-0 flex-1 text-[12px] font-medium text-[#8a8a8a]">Product</span>
                  <span className="w-[64px] shrink-0 text-center text-[12px] font-medium text-[#8a8a8a]">Qty</span>
                  <span className="w-[92px] shrink-0 text-center text-[12px] font-medium text-[#8a8a8a]">Unit cost</span>
                  <span className="w-[92px] shrink-0 text-right text-[12px] font-medium text-[#8a8a8a]">Line</span>
                  {edit && <span className="w-[20px] shrink-0" />}
                </div>

                {/* The lines scroll; the head and the total do not. */}
                <div className="max-h-[240px] overflow-y-auto">
                  {openDetail.loading && (
                    <p className="px-[12px] py-[10px] text-[13px] text-[#8f8d87]">Loading lines…</p>
                  )}
                  {!openDetail.loading && (edit?.lines ?? openDetail.data?.items ?? []).length === 0 && (
                    <p className="px-[12px] py-[10px] text-[13px] text-[#8f8d87]">
                      This order has no lines.
                    </p>
                  )}

                  {edit
                    ? edit.lines.map((l) => (
                        <div
                          key={l.variantId}
                          className="flex items-center gap-[8px] border-b border-solid border-[#eaeaea] px-[12px] py-[8px] last:border-b-0"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13px] text-[#1e1e1e]">{l.name}</span>
                            <span className="truncate text-[11px] text-[#8f8d87]">{l.sku}</span>
                          </span>
                          <input
                            value={String(l.quantity)}
                            onChange={(e) => {
                              const quantity = Number(e.target.value.replace(/[^\d]/g, "")) || 0;
                              setEdit((d) =>
                                d
                                  ? {
                                      ...d,
                                      lines: d.lines.map((x) =>
                                        x.variantId === l.variantId ? { ...x, quantity } : x
                                      ),
                                    }
                                  : d
                              );
                              setEditError(null);
                            }}
                            inputMode="numeric"
                            aria-label={`Quantity of ${l.name}`}
                            className="h-[32px] w-[64px] shrink-0 rounded-[8px] bg-white text-center text-[13px] tabular-nums text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
                          />
                          <input
                            value={l.unitCost}
                            onChange={(e) => {
                              const unitCost = e.target.value.replace(/[^\d.]/g, "");
                              setEdit((d) =>
                                d
                                  ? {
                                      ...d,
                                      lines: d.lines.map((x) =>
                                        x.variantId === l.variantId ? { ...x, unitCost } : x
                                      ),
                                    }
                                  : d
                              );
                              setEditError(null);
                            }}
                            inputMode="decimal"
                            aria-label={`Unit cost of ${l.name}`}
                            className="h-[32px] w-[92px] shrink-0 rounded-[8px] bg-white text-center text-[13px] tabular-nums text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
                          />
                          <span className="w-[92px] shrink-0 truncate text-right text-[13px] tabular-nums text-[#525252]">
                            {formatMoney(l.quantity * (Number(l.unitCost) || 0))}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEdit((d) =>
                                d
                                  ? { ...d, lines: d.lines.filter((x) => x.variantId !== l.variantId) }
                                  : d
                              )
                            }
                            aria-label={`Remove ${l.name}`}
                            className="w-[20px] shrink-0 cursor-pointer text-[16px] leading-none text-[#a3a3a3] transition-colors hover:text-[#ef4444]"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    : (openDetail.data?.items ?? []).map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center gap-[8px] border-b border-solid border-[#eaeaea] px-[12px] py-[9px] last:border-b-0"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13px] text-[#1e1e1e]">{l.name}</span>
                            <span className="truncate text-[11px] text-[#8f8d87]">{l.sku}</span>
                          </span>
                          <span className="w-[64px] shrink-0 text-center text-[13px] tabular-nums text-[#525252]">
                            {l.quantity}
                          </span>
                          <span className="w-[92px] shrink-0 text-center text-[13px] tabular-nums text-[#525252]">
                            {formatMoney(l.unitCost)}
                          </span>
                          <span className="w-[92px] shrink-0 truncate text-right text-[13px] tabular-nums text-[#525252]">
                            {formatMoney(l.lineTotal)}
                          </span>
                        </div>
                      ))}
                </div>
              </div>
            </div>

            {edit ? (
              <div className="flex flex-col gap-[12px]">
                <label className="flex flex-col gap-[6px]">
                  <span className="text-[14px] font-medium text-[#525252]">Supplier</span>
                  <select
                    value={edit.supplierId}
                    onChange={(e) => {
                      const supplierId = e.target.value;
                      setEdit((d) => (d ? { ...d, supplierId } : d));
                      setEditError(null);
                    }}
                    className="h-[44px] cursor-pointer rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none"
                  >
                    <option value="">Select a supplier</option>
                    {(suppliers.data?.data ?? []).map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-[12px] sm:flex-row">
                  <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                    <span className="text-[14px] font-medium text-[#525252]">Purchase date</span>
                    <input
                      type="date"
                      value={edit.purchaseDate}
                      onChange={(e) => {
                        const purchaseDate = e.target.value;
                        setEdit((d) => (d ? { ...d, purchaseDate } : d));
                        setEditError(null);
                      }}
                      aria-label="Purchase date"
                      className="h-[44px] rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none"
                    />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                    <span className="text-[14px] font-medium text-[#525252]">Supplier invoice</span>
                    <input
                      value={edit.invoiceNo}
                      onChange={(e) => {
                        const invoiceNo = e.target.value;
                        setEdit((d) => (d ? { ...d, invoiceNo } : d));
                      }}
                      placeholder="Their reference, not ours"
                      aria-label="Supplier invoice number"
                      className="h-[44px] rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                    />
                  </label>
                </div>
                <p className="text-[12px] leading-[1.5] text-[#8a8a8a]">
                  Saving replaces the whole line set and recomputes the totals. A line removed here
                  is gone from the order.
                </p>
                {editError && <p className="text-[13px] text-[#ef4444]">{editError}</p>}
              </div>
            ) : (
              !editable && (
                <p className="text-[12px] leading-[1.5] text-[#8a8a8a]">
                  {detailOf.status === "Cancelled"
                    ? "A cancelled order cannot be edited."
                    : "Only a draft can be edited. This order has been confirmed, so the supplier is already owed against these figures — a correction is a return."}
                </p>
              )
            )}
          </div>
        )}
      </Modal>

      {/* Printable purchase order */}
      <Modal
        open={receiptOf !== null}
        onClose={() => setReceiptOf(null)}
        title="Purchase order"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setReceiptOf(null)}>
              Close
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => window.print()}
            >
              Print
            </button>
          </>
        }
      >
        {receiptOf && (
          <div className="print-area">
            {/* The same slip the till prints, from the same component — the
                header is the shop's, not the software's, and the lines are
                the order rather than a count of them. */}
            {purchaseDetailLoading && !purchaseDetail ? (
              <DetailSkeleton rows={7} />
            ) : purchaseDetail ? (
              <Receipt
                business={{
                  name: shop.name,
                  tagline: shop.tagline,
                  address: shop.address,
                  bin: shop.bin,
                }}
                title="PURCHASE ORDER"
                itemsHeading="Item"
                meta={[
                  { label: "Order No", value: purchaseDetail.referenceNo || receiptOf.purchaseId },
                  { label: "Date", value: receiptOf.purchaseDate },
                  { label: "Supplier", value: purchaseDetail.supplierName || receiptOf.supplier.name },
                  ...(purchaseDetail.supplierInvoiceNo
                    ? [{ label: "Their Invoice", value: purchaseDetail.supplierInvoiceNo }]
                    : []),
                  { label: "Status", value: receiptOf.status },
                  { label: "Payment", value: receiptOf.paymentStatus },
                ]}
                items={purchaseDetail.items.map((it) => ({
                  // The size belongs on the printed order: "20 × Coca-Cola"
                  // is not something a supplier can pick against when the
                  // product comes in three.
                  name: it.variantLabel ? `${it.name} ${it.variantLabel}` : it.name,
                  price: formatMoney(it.unitCost, MONEY),
                  qty: it.quantity,
                  total: formatMoney(it.lineTotal, MONEY),
                }))}
                totals={[
                  { label: "Subtotal", value: formatMoney(purchaseDetail.subtotal, MONEY) },
                  ...(purchaseDetail.discount
                    ? [{ label: "Discount", value: `-${formatMoney(purchaseDetail.discount, MONEY)}` }]
                    : []),
                  ...(purchaseDetail.tax ? [{ label: "VAT", value: formatMoney(purchaseDetail.tax, MONEY) }] : []),
                  ...(purchaseDetail.shipping
                    ? [{ label: "Shipping", value: formatMoney(purchaseDetail.shipping, MONEY) }]
                    : []),
                  { label: "Total Amount", value: formatMoney(purchaseDetail.grandTotal, MONEY), strong: true, ruleAbove: true },
                  { label: "Paid", value: formatMoney(purchaseDetail.paid, MONEY) },
                  ...(purchaseDetail.due
                    ? [{ label: "Due", value: formatMoney(purchaseDetail.due, MONEY), strong: true }]
                    : []),
                ]}
                footerNotes={["Authorised signature ____________________"]}
                system={{ name: "SortPi" }}
              />
            ) : (
              <ErrorState message="Could not load this order." onRetry={refetchPurchase} compact />
            )}
          </div>
        )}
      </Modal>

      {/* Mark received / paid */}
      <Modal
        open={markOf !== null}
        onClose={() => setMarkOf(null)}
        title={markOf?.kind === "paid" ? "Mark as paid" : "Mark as received"}
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setMarkOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              disabled={working}
              onClick={applyMark}
            >
              {working
                ? "Working…"
                : markOf?.kind === "paid"
                  ? "Confirm payment"
                  : "Confirm receipt"}
            </button>
          </>
        }
      >
        {markOf && (
          <div className="flex flex-col gap-[12px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              {markOf.kind === "paid" ? (
                <>
                  Pay <span className="font-medium text-[#1e1e1e]">{markOf.row.supplier.name}</span> against{" "}
                  <span className="font-medium text-[#1e1e1e]">{markOf.row.purchaseId}</span>, total{" "}
                  <span className="font-medium text-[#1e1e1e]">{markOf.row.totalAmountFormatted}</span>.
                </>
              ) : (
                <>
                  Receive <span className="font-medium text-[#1e1e1e]">{markOf.row.purchaseId}</span> (
                  {markOf.row.itemsCount} items from{" "}
                  <span className="font-medium text-[#1e1e1e]">{markOf.row.supplier.name}</span>)? This books
                  the goods into stock and posts to the supplier ledger.
                </>
              )}
            </p>

            {/* A supplier is often paid in instalments, so the amount is asked
                for rather than assumed to be the whole invoice. */}
            {markOf.kind === "paid" && (
              <div className="flex flex-col gap-[6px]">
                <AmountLabel
                  htmlFor="pur-pay"
                  onMax={() => {
                    setPayAmount(String(markOf.row?.dueAmount ?? 0));
                    setMarkError(null);
                  }}
                  maxDisabled={!markOf.row?.dueAmount}
                >
                  Amount
                </AmountLabel>
                <input
                  id="pur-pay"
                  autoFocus
                  value={payAmount}
                  onChange={(e) => {
                    // Never more than the invoice still owes — the API refuses
                    // an over-payment with an error naming the due, and being
                    // told after typing is worse than not being able to. See
                    // `@/lib/money`.
                    setPayAmount(clampTypedAmount(e.target, markOf.row?.dueAmount ?? 0));
                    setMarkError(null);
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Payment amount"
                  className="flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
              </div>
            )}

            {markError && <p className="text-[13px] text-[#ef4444]">{markError}</p>}
          </div>
        )}
      </Modal>
      {/* Import — a CSV of items, plus the header they hang off.
          The same component the Add Purchase screen uses, so the two cannot
          disagree about what a valid file is. */}
      <Modal
        open={importOpen}
        onClose={() => {
          if (importSaving) return;
          setImportOpen(false);
          setImportDone(null);
          setImportError(null);
        }}
        title="Import Purchases"
        width={640}
        footer={
          <button
            type="button"
            className={MODAL_GHOST}
            disabled={importSaving}
            onClick={() => {
              setImportOpen(false);
              setImportDone(null);
              setImportError(null);
            }}
          >
            {importDone ? "Done" : "Cancel"}
          </button>
        }
      >
        {importDone ? (
          <div className="flex flex-col gap-[12px]">
            <p className="rounded-[10px] bg-[#eaf7ef] px-[14px] py-[12px] text-[14px] leading-[1.7] text-[#1f6f43]">
              {importDone}
            </p>
            <p className="text-[13px] leading-[1.7] text-[#525252]">
              It is a DRAFT: nothing has been ordered and no stock has moved yet. Open it from
              the list to check it, then confirm and receive it as you would any other order.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[16px]">
            {/* Who it is from and where it lands. The file carries neither —
                item lines only — which is what lets the same file be used on
                the Add Purchase screen. */}
            <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
              <label className="flex flex-col gap-[6px]">
                <span className="text-[13px] font-medium text-[#525252]">
                  Supplier <span className="text-[#c80000]">*</span>
                </span>
                <select
                  value={importSupplier}
                  onChange={(e) => setImportSupplier(e.target.value)}
                  aria-label="Supplier"
                  className="h-[44px] w-full cursor-pointer rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none"
                >
                  <option value="">Choose a supplier…</option>
                  {(suppliers.data?.data ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[13px] font-medium text-[#525252]">
                  Deliver to <span className="text-[#c80000]">*</span>
                </span>
                <select
                  value={chosenWarehouse}
                  onChange={(e) => setImportWarehouse(e.target.value)}
                  aria-label="Warehouse"
                  className="h-[44px] w-full cursor-pointer rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none"
                >
                  <option value="">Choose a warehouse…</option>
                  {importWarehouses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[13px] font-medium text-[#525252]">
                  Purchase date <span className="text-[#c80000]">*</span>
                </span>
                <input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  aria-label="Purchase date"
                  className="h-[44px] w-full cursor-pointer rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none"
                />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[13px] font-medium text-[#525252]">
                  Supplier invoice <span className="text-[#8f8d87]">(optional)</span>
                </span>
                <input
                  value={importInvoice}
                  onChange={(e) => setImportInvoice(e.target.value)}
                  placeholder="Their reference, not ours"
                  aria-label="Supplier invoice number"
                  className="h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
              </label>
            </div>

            {!importReady && (
              <p className="text-[13px] text-[#8a6d00]">
                Choose a supplier, a warehouse and a date before importing the file.
              </p>
            )}

            <PurchaseImport
              intro="Upload the supplier's invoice as a CSV. It will be saved as a draft purchase order you can check before confirming."
              confirmLabel="Import and save as draft"
              busy={!importReady || importSaving}
              onImported={savePurchase}
            />

            {importError && (
              <p
                role="alert"
                className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
              >
                {importError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
