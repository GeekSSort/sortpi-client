"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InventoryService, PurchaseService, SupplierService, TransferService } from "@/services";
import type { InventoryProduct } from "@/types/inventory";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { FormSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { useSession } from "@/services/useSession";
import { formatMoney } from "@/lib/format";

/**
 * Raise a purchase order.
 *
 * The API has had `POST /purchases/` since the module was built and nothing in
 * the app called it: the purchases screen listed orders it had no way to
 * create.
 *
 * What it saves is a DRAFT and only a draft. No stock moves and the supplier is
 * owed nothing until somebody CONFIRMS it, and nothing is on a shelf until
 * somebody RECEIVES it — both of which are actions on the purchases list.
 * Stopping here is the point: an order is a document written before the goods
 * exist, and pretending otherwise is how a shop ends up with stock the ledger
 * cannot explain.
 */

const LABEL = "w-full text-[15px] leading-[22px] font-medium text-[#525252]";

/** The mark on a field the form will not submit without. Not decoration: the
    two optional blocks below sit among the required ones, and a person filling
    this in should be able to see which is which before they hit Save. */
function Required() {
  return (
    <span aria-hidden className="text-[#e63946]">
      {" *"}
    </span>
  );
}

/** What the supplier was paid with. `purchasing.PaymentMethod`, verbatim —
    anything else is a 400 on a field nobody typed.

    CREDIT is left off on purpose: it means the money has NOT changed hands,
    which is the one thing an advance is not. Ordering on credit is this box
    left empty. */
const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK", label: "Bank transfer" },
  { value: "MOBILE", label: "Mobile banking" },
  { value: "OTHER", label: "Other" },
];
const FIELD =
  "flex h-[48px] w-full items-center rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[14px]";
/** The 44px field the dialogs in this app use. */
const MODAL_INPUT =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]";

const INPUT =
  "min-w-px flex-1 bg-transparent text-[15px] leading-[22px] font-normal text-[#525252] outline-none placeholder:text-[rgba(82,82,82,0.6)]";

/** A unique reference for one order. Module scope: reading the clock is a side
    effect and does not belong in a component body. */
function purchaseRef(): string {
  return `PO-${Date.now()}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Line {
  variantId: string;
  name: string;
  sku: string;
  quantity: number;
  /** Kept as typed, not as a number: "12." is a state a person passes through
      on the way to 12.50, and coercing every keystroke fights them. */
  unitCost: string;
}

export default function AddPurchasePage() {
  const router = useRouter();
  const session = useSession();

  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [invoiceNo, setInvoiceNo] = useState("");
  const [note, setNote] = useState("");
  /** An advance handed over when the order is placed. Optional — and paying
      one CONFIRMS the order, because nothing is owed on a draft. */
  const [initialAmount, setInitialAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  /** The brand-new product being described, or null. A purchase is where a
      shop meets a product for the first time — the picker could only find ones
      it already had, so anything new had to be created on another screen and
      the order abandoned halfway. */
  const [newProduct, setNewProduct] = useState<{
    name: string;
    categoryId: string;
    brandId: string;
    unitId: string;
    sku: string;
    barcode: string;
    sellingPrice: string;
  } | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [pickQuery, setPickQuery] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const branchId = session.user?.activeBranch?.id ?? "";

  const suppliers = useQuery(queryKey("suppliers", { limit: 200 }), () =>
    SupplierService.getSuppliers({ limit: 200 })
  );
  const warehouseQuery = useQuery(queryKey("warehouses"), () => TransferService.getWarehouses());

  // The category, brand and unit lists, only once somebody is describing a new
  // product. Shared with the Add Product form's cache entry.
  const catalog = useQuery(
    queryKey("inventory", { part: "catalog" }),
    () => InventoryService.getCatalogOptions(),
    { enabled: newProduct !== null }
  );
  const options = catalog.data ?? { categories: [], brands: [], units: [], taxes: [] };

  // Goods are delivered onto a shelf in THIS branch. `/warehouses/` lists every
  // branch the caller can reach — that is what the transfer screen needs — so
  // it is narrowed here, and TRANSIT is machinery rather than a place a
  // supplier delivers to.
  const warehouses = useMemo(() => {
    const all = (warehouseQuery.data ?? []).filter((w) => w.type !== "TRANSIT");
    const here = branchId ? all.filter((w) => w.branchId === branchId) : all;
    return here.length > 0 ? here : all;
  }, [warehouseQuery.data, branchId]);

  // One warehouse and no choice to make: pick it rather than ask. Derived
  // rather than written into state by an effect — an effect has to wait for a
  // render, so the field flashes empty on the way past, and the same pattern is
  // what the Add Product form does for a shop with one unit.
  const warehouse = warehouseId || (warehouses.length === 1 ? warehouses[0].id : "");

  /** The catalogue, searched server-side as the buyer types. */
  const [term, setTerm] = useState("");
  useEffect(() => {
    if (pickQuery === term) return;
    const id = window.setTimeout(() => setTerm(pickQuery), 250);
    return () => window.clearTimeout(id);
  }, [pickQuery, term]);

  const catalogue = useQuery(
    queryKey("inventory", { part: "purchase-picker", search: term }),
    () => InventoryService.getProducts({ search: term, page: 1, limit: 20 }),
    { enabled: pickOpen }
  );

  const pickable = useMemo(() => {
    const taken = new Set(lines.map((l) => l.variantId));
    return (catalogue.data?.data ?? []).filter((p) => p.variantId && !taken.has(p.variantId));
  }, [catalogue.data, lines]);

  const addLine = (product: InventoryProduct) => {
    setLines((current) => [
      ...current,
      {
        variantId: product.variantId,
        name: product.name,
        sku: product.sku,
        quantity: 1,
        // The selling price is a starting point a buyer will overtype. It is
        // NOT the cost — leaving the box empty would be honest and make every
        // line a retype, so it is offered and clearly labelled.
        unitCost: "",
      },
    ]);
    setPickQuery("");
    setPickOpen(false);
    setError(null);
  };

  /** Open the new-product form, carrying whatever was already typed as its
      name — the search that found nothing is the name nine times in ten. */
  const startNewProduct = () => {
    setNewProduct({
      name: pickQuery.trim(),
      categoryId: "",
      brandId: "",
      unitId: "",
      sku: "",
      barcode: "",
      sellingPrice: "",
    });
    setNewError(null);
    setPickOpen(false);
  };

  /**
   * Create the product, then put it on the order.
   *
   * It is a real catalogue product from this moment — it appears on Products,
   * on the till and everywhere else that reads the catalogue, which is why the
   * caches are invalidated rather than just the line being added here.
   */
  const createProductAndAdd = async () => {
    if (!newProduct || creating) return;
    const draft = newProduct;
    if (!draft.name.trim()) return setNewError("Give the product a name.");
    if (!draft.categoryId) return setNewError("Pick a category.");
    if (!draft.unitId) return setNewError("Pick a unit.");

    setCreating(true);
    setNewError(null);
    try {
      const created = await InventoryService.createProduct({
        name: draft.name.trim(),
        categoryId: draft.categoryId,
        unitId: draft.unitId,
        brandId: draft.brandId || undefined,
        sku: draft.sku.trim() || undefined,
        barcode: draft.barcode.trim() || undefined,
        // Optional on purpose: a product met on a purchase order has a cost
        // before it has a shelf price, and a zero price is not the same fact
        // as no price.
        sellingPrice: Number(draft.sellingPrice) > 0 ? Number(draft.sellingPrice) : undefined,
      });
      if (!created.variantId) {
        throw new Error("That product was created without a variant to order against.");
      }
      setLines((current) => [
        ...current,
        {
          variantId: created.variantId,
          name: created.name,
          sku: created.sku,
          quantity: 1,
          unitCost: "",
        },
      ]);
      // It is in the catalogue now, so every screen that reads the catalogue is
      // out of date — the products table, the till's wall, the dashboard count.
      invalidate("inventory", "pos-products", "pos-categories", "dashboard");
      setNewProduct(null);
      setPickQuery("");
      setError(null);
    } catch (err) {
      setNewError(
        err instanceof Error && err.message ? err.message : "That product could not be created."
      );
    } finally {
      setCreating(false);
    }
  };

  const patchLine = (variantId: string, patch: Partial<Line>) =>
    setLines((current) => current.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));

  const removeLine = (variantId: string) =>
    setLines((current) => current.filter((l) => l.variantId !== variantId));

  /** The buyer's running total. The server recomputes what actually gets
      saved — this is here so nobody has to add it up on paper. */
  const total = useMemo(
    () => lines.reduce((n, l) => n + l.quantity * (Number(l.unitCost) || 0), 0),
    [lines]
  );

  const save = async () => {
    if (saving) return;
    if (!supplierId) return setError("Pick a supplier.");
    if (!branchId) return setError("Switch to a branch before raising an order.");
    if (!warehouse) return setError("Pick the warehouse the goods arrive at.");
    if (!purchaseDate) return setError("Pick a purchase date.");
    if (lines.length === 0) return setError("Add at least one product.");

    const empty = lines.find((l) => l.quantity <= 0);
    if (empty) return setError(`Enter a quantity for ${empty.name}.`);
    const uncosted = lines.find((l) => !(Number(l.unitCost) > 0));
    if (uncosted) {
      return setError(
        `Enter what ${uncosted.name} costs. It is what the stock is worth when the goods arrive.`
      );
    }

    const advance = Number(initialAmount) || 0;
    if (initialAmount.trim() && advance <= 0) {
      return setError("An initial payment has to be greater than zero, or leave it blank.");
    }
    // The API refuses more than the outstanding due as a keying error, and here
    // the due is the whole order.
    if (advance > total) {
      return setError(
        `An initial payment cannot exceed the order total of ${formatMoney(total)}.`
      );
    }

    setSaving(true);
    setError(null);

    /**
     * Which step got there, so a failure can say what DID happen.
     *
     * Saving with an advance payment is three requests — create, confirm, pay —
     * and one `catch` reported all three as "the order could not be saved". If
     * the payment failed, the order existed and the supplier was already owed
     * for it; the obvious response to that message is to fill the form in
     * again, and that raises a SECOND order and a SECOND payable to the same
     * supplier for the same goods.
     *
     * They cannot be made one transaction from here — three endpoints, three
     * commits — so the honest thing is to report the boundary crossed.
     */
    let stage: "drafting" | "confirming" | "paying" = "drafting";
    let reference = "";

    try {
      const created = await PurchaseService.createPurchase({
        referenceNo: purchaseRef(),
        supplierId,
        branchId,
        warehouseId: warehouse,
        purchaseDate,
        supplierInvoiceNo: invoiceNo.trim() || undefined,
        note: note.trim() || undefined,
        items: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitCost: Number(l.unitCost),
        })),
      });

      reference = created.purchaseId;

      if (advance > 0) {
        // Confirm FIRST. Nothing is owed on a draft, so the API refuses a
        // payment against one — `PURCHASE_NOT_CONFIRMED`. Handing a supplier
        // money when you place the order is placing the order, so this is the
        // honest reading of what the person just did rather than a workaround.
        stage = "confirming";
        await PurchaseService.confirm(created.id);
        stage = "paying";
        await PurchaseService.recordPayment(created.id, advance, paymentMethod, "", purchaseDate);
        setSaved(
          `${created.purchaseId} confirmed with ${formatMoney(advance)} paid — receive the goods when they arrive`
        );
      } else {
        setSaved(`${created.purchaseId} drafted — confirm it to owe the supplier`);
      }
      invalidate("purchases", "suppliers", "dashboard");
      window.setTimeout(() => router.push("/purchases"), 800);
    } catch (err) {
      // The server names the real problem — a duplicate reference, a supplier
      // that is not this organization's — and that is more use than "try again".
      const said = err instanceof Error && err.message ? err.message : "";

      if (stage === "drafting") {
        setError(said || "The order could not be saved.");
      } else {
        // The order EXISTS. Say so first and say it plainly, because the next
        // thing this person does is decide whether to fill the form in again.
        const owed =
          stage === "confirming"
            ? `${reference} was saved as a draft, but confirming it failed, so the supplier is not owed for it yet.`
            : `${reference} was saved and confirmed — the supplier is owed for it — but the ${formatMoney(
                advance
              )} payment was not recorded.`;
        setError(
          `${owed}${said ? ` ${said}` : ""} Do not enter this order again: finish it from the purchases list.`
        );
        // The list is where they finish it, and it has to be current when they
        // get there.
        invalidate("purchases", "suppliers", "dashboard");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="mx-auto flex w-full max-w-[720px] flex-col gap-[20px]"
      >
        <div className="relative w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
          <RefreshBar active={suppliers.fetching || warehouseQuery.fetching} />
          <div className="flex h-[60px] items-center justify-center px-[16px]">
            <h1 className="text-[20px] leading-[28px] font-semibold tracking-[-0.4px] text-[#1e1e1e]">
              New Purchase Order
            </h1>
          </div>

          <div className="flex flex-col gap-[14px] px-[16px] pt-[8px] pb-[16px]">
            <QueryBoundary
              loading={suppliers.loading || warehouseQuery.loading}
              error={suppliers.error ?? warehouseQuery.error}
              hasData={suppliers.data !== undefined && warehouseQuery.data !== undefined}
              skeleton={<FormSkeleton fields={5} columns={1} />}
              errorMessage="The supplier and warehouse lists could not be loaded."
              onRetry={() => {
                suppliers.refetch();
                warehouseQuery.refetch();
              }}
            >
              <div className="flex flex-col gap-[14px] sm:flex-row">
                <label className="flex min-w-0 flex-1 flex-col gap-[8px]">
                  <span className={LABEL}>
                    Supplier
                    <Required />
                  </span>
                  <select
                    value={supplierId}
                    onChange={(e) => {
                      setSupplierId(e.target.value);
                      setError(null);
                    }}
                    className={`${FIELD} cursor-pointer`}
                  >
                    <option value="">Select a supplier</option>
                    {(suppliers.data?.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-0 flex-1 flex-col gap-[8px]">
                  <span className={LABEL}>
                    Delivered to
                    <Required />
                  </span>
                  <select
                    value={warehouse}
                    onChange={(e) => {
                      setWarehouseId(e.target.value);
                      setError(null);
                    }}
                    className={`${FIELD} cursor-pointer`}
                  >
                    <option value="">Select a warehouse</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-[14px] sm:flex-row">
                <label className="flex min-w-0 flex-1 flex-col gap-[8px]">
                  <span className={LABEL}>
                    Purchase date
                    <Required />
                  </span>
                  <div className={FIELD}>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => {
                        setPurchaseDate(e.target.value);
                        setError(null);
                      }}
                      aria-label="Purchase date"
                      className={INPUT}
                    />
                  </div>
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-[8px]">
                  <span className={LABEL}>
                    Supplier invoice <span className="text-[#8f8d87]">(optional)</span>
                  </span>
                  <div className={FIELD}>
                    <input
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="Their reference, not ours"
                      aria-label="Supplier invoice number"
                      className={INPUT}
                    />
                  </div>
                </label>
              </div>

              {/* Type a name, pick it, set how many and what each one costs. */}
              <div className="flex flex-col gap-[8px]">
                <span className={LABEL}>
                  Products
                  <Required />
                </span>
                <div className="relative">
                  <div className={FIELD}>
                    <input
                      value={pickQuery}
                      onChange={(e) => {
                        setPickQuery(e.target.value);
                        setPickOpen(true);
                        setError(null);
                      }}
                      onFocus={() => setPickOpen(true)}
                      // A click on an option has to land before the list closes.
                      onBlur={() => window.setTimeout(() => setPickOpen(false), 140)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && pickable.length > 0) {
                          e.preventDefault();
                          addLine(pickable[0]);
                        }
                        if (e.key === "Escape") setPickOpen(false);
                      }}
                      placeholder="Search the catalogue by name or SKU…"
                      aria-label="Product to order"
                      className={INPUT}
                    />
                  </div>
                  {pickOpen && (
                    <div className="absolute top-[52px] right-0 left-0 z-40 max-h-[240px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                      {catalogue.loading && (
                        <p className="px-[14px] py-[9px] text-[13px] text-[#8f8d87]">Searching…</p>
                      )}
                      {!catalogue.loading && pickable.length === 0 && (
                        <p className="px-[14px] py-[9px] text-[13px] text-[#8f8d87]">
                          {pickQuery.trim()
                            ? "Nothing in the catalogue matches."
                            : "Start typing to find a product."}
                        </p>
                      )}
                      {pickable.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addLine(p)}
                          className="flex w-full cursor-pointer items-center justify-between gap-[10px] px-[14px] py-[9px] text-left transition-colors hover:bg-[#fafafa]"
                        >
                          <span className="min-w-0 truncate text-[13px] text-[#525252]">
                            {p.name}
                            <span className="text-[#a3a3a3]"> · {p.sku}</span>
                          </span>
                          <span className="shrink-0 truncate text-[12px] text-[#8f8d87]">
                            {p.brand}
                          </span>
                        </button>
                      ))}
                      {/* A purchase is where a shop meets a product for the
                          first time. Always offered, not only when the search
                          finds nothing: a near-match is not the same product,
                          and being made to leave for another screen is what
                          loses the half-typed order. */}
                      <button
                        type="button"
                        onClick={startNewProduct}
                        className="flex w-full cursor-pointer items-center gap-[8px] border-t border-solid border-[#eaeaea] px-[14px] py-[10px] text-left text-[13px] font-medium text-[#f5b800] transition-colors hover:bg-[#fffaeb]"
                      >
                        <span className="text-[16px] leading-none">+</span>
                        {pickQuery.trim() ? `Add "${pickQuery.trim()}" as a new product` : "Add a new product"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {lines.length > 0 && (
                <div className="overflow-hidden rounded-[10px] border border-solid border-[#eaeaea]">
                  <div className="flex items-center gap-[8px] border-b border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[8px]">
                    <span className="min-w-0 flex-1 text-[12px] font-medium text-[#8a8a8a]">
                      Product
                    </span>
                    <span className="w-[72px] shrink-0 text-center text-[12px] font-medium text-[#8a8a8a]">
                      Qty
                    </span>
                    <span className="w-[96px] shrink-0 text-center text-[12px] font-medium text-[#8a8a8a]">
                      Unit cost
                    </span>
                    <span className="w-[92px] shrink-0 text-right text-[12px] font-medium text-[#8a8a8a]">
                      Line
                    </span>
                    <span className="w-[20px] shrink-0" />
                  </div>

                  {/* The lines scroll; the head and the total do not. */}
                  <div className="max-h-[280px] overflow-y-auto">
                    {lines.map((l) => (
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
                            patchLine(l.variantId, {
                              quantity: Number(e.target.value.replace(/[^\d]/g, "")) || 0,
                            });
                            setError(null);
                          }}
                          inputMode="numeric"
                          aria-label={`Quantity of ${l.name}`}
                          className="h-[34px] w-[72px] shrink-0 rounded-[8px] bg-white text-center text-[13px] tabular-nums text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
                        />
                        <input
                          value={l.unitCost}
                          onChange={(e) => {
                            patchLine(l.variantId, {
                              unitCost: e.target.value.replace(/[^\d.]/g, ""),
                            });
                            setError(null);
                          }}
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`Unit cost of ${l.name}`}
                          className="h-[34px] w-[96px] shrink-0 rounded-[8px] bg-white text-center text-[13px] tabular-nums text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
                        />
                        <span className="w-[92px] shrink-0 truncate text-right text-[13px] tabular-nums text-[#525252]">
                          {formatMoney(l.quantity * (Number(l.unitCost) || 0))}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(l.variantId)}
                          aria-label={`Remove ${l.name}`}
                          className="w-[20px] shrink-0 cursor-pointer text-[16px] leading-none text-[#a3a3a3] transition-colors hover:text-[#ef4444]"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-[8px] border-t border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[9px]">
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-[#525252]">
                      {lines.length} product{lines.length === 1 ? "" : "s"}
                    </span>
                    <span className="text-[14px] font-semibold tabular-nums text-[#1e1e1e]">
                      {formatMoney(total)}
                    </span>
                    <span className="w-[20px] shrink-0" />
                  </div>
                </div>
              )}

              <label className="flex flex-col gap-[8px]">
                <span className={LABEL}>
                  Note <span className="text-[#8f8d87]">(optional)</span>
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Anything the person receiving this needs to know"
                  aria-label="Note"
                  className="w-full rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[14px] py-[10px] text-[15px] text-[#525252] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
              </label>

              {/* An advance handed over at the counter. Optional, and the only
                  field on this form with a consequence beyond the document:
                  paying one confirms the order, because nothing is owed on a
                  draft and the API refuses a payment against one. */}
              <div className="flex flex-col gap-[14px] sm:flex-row">
                <label className="flex min-w-0 flex-1 flex-col gap-[8px]">
                  <span className={LABEL}>
                    Initial payment <span className="text-[#8f8d87]">(optional)</span>
                  </span>
                  <div className={FIELD}>
                    <input
                      value={initialAmount}
                      onChange={(e) => {
                        setInitialAmount(e.target.value.replace(/[^\d.]/g, ""));
                        setError(null);
                      }}
                      inputMode="decimal"
                      placeholder="৳ 0.00"
                      aria-label="Initial payment"
                      className={INPUT}
                    />
                  </div>
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-[8px]">
                  <span className={LABEL}>
                    Paid by <span className="text-[#8f8d87]">(optional)</span>
                  </span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    disabled={!(Number(initialAmount) > 0)}
                    aria-label="Payment method"
                    className={`${FIELD} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="text-[12px] leading-[1.5] text-[#8a8a8a]">
                <span className="text-[#e63946]">*</span> required.{" "}
                {Number(initialAmount) > 0 ? (
                  <>
                    Paying an advance CONFIRMS this order — nothing is owed on a draft, so there is
                    nothing to pay against one. The supplier is owed{" "}
                    {formatMoney(Math.max(0, total - (Number(initialAmount) || 0)))} after this.
                    Nothing is on a shelf until you receive the goods.
                  </>
                ) : (
                  <>
                    This saves a DRAFT. Nothing is owed and nothing is on a shelf until you confirm
                    the order and receive the goods — both from the purchases list.
                  </>
                )}
              </p>
              {error && <p className="text-[13px] text-[#ef4444]">{error}</p>}
              {saved && <p className="text-[13px] text-[#525252]">{saved}</p>}
            </QueryBoundary>
          </div>
        </div>

      {/* Describe a product the shop has never bought before */}
        <button
          type="submit"
          disabled={saving}
          style={{ backgroundImage: GOLD_GRADIENT }}
          className="flex h-[48px] w-full cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* The button says what it will do. An advance makes this more than a
              save, and finding that out afterwards is finding out too late. */}
          {saving
            ? "Saving…"
            : Number(initialAmount) > 0
              ? `Save, confirm and pay ${formatMoney(Number(initialAmount))}`
              : "Save Purchase Order"}
        </button>
      </form>

      {/* Outside the <form>: this Modal renders inline rather than through
          a portal, so nested in the form its inputs belong to that form and
          Enter in one would submit the order. */}
      <Modal
        open={newProduct !== null}
        onClose={() => setNewProduct(null)}
        title="New product"
        width={480}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setNewProduct(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={creating}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => void createProductAndAdd()}
            >
              {creating ? "Creating…" : "Create and add"}
            </button>
          </>
        }
      >
        {newProduct && (
          <div className="flex flex-col gap-[12px]">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[14px] font-medium text-[#525252]">
                Product name
                <Required />
              </span>
              <input
                autoFocus
                value={newProduct.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewProduct((d) => (d ? { ...d, name } : d));
                  setNewError(null);
                }}
                placeholder="What the supplier calls it"
                aria-label="Product name"
                className={MODAL_INPUT}
              />
            </label>

            <div className="flex flex-col gap-[12px] sm:flex-row">
              <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <span className="text-[14px] font-medium text-[#525252]">
                  Category
                  <Required />
                </span>
                <select
                  value={newProduct.categoryId}
                  onChange={(e) => {
                    const categoryId = e.target.value;
                    setNewProduct((d) => (d ? { ...d, categoryId } : d));
                    setNewError(null);
                  }}
                  aria-label="Category"
                  className={`${MODAL_INPUT} cursor-pointer`}
                >
                  <option value="">Select</option>
                  {options.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <span className="text-[14px] font-medium text-[#525252]">
                  Unit
                  <Required />
                </span>
                <select
                  value={newProduct.unitId}
                  onChange={(e) => {
                    const unitId = e.target.value;
                    setNewProduct((d) => (d ? { ...d, unitId } : d));
                    setNewError(null);
                  }}
                  aria-label="Unit"
                  className={`${MODAL_INPUT} cursor-pointer`}
                >
                  <option value="">Select</option>
                  {options.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-[12px] sm:flex-row">
              <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <span className="text-[14px] font-medium text-[#525252]">
                  Brand <span className="text-[#8f8d87]">(optional)</span>
                </span>
                <select
                  value={newProduct.brandId}
                  onChange={(e) => {
                    const brandId = e.target.value;
                    setNewProduct((d) => (d ? { ...d, brandId } : d));
                  }}
                  aria-label="Brand"
                  className={`${MODAL_INPUT} cursor-pointer`}
                >
                  <option value="">No brand</option>
                  {options.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <span className="text-[14px] font-medium text-[#525252]">
                  Selling price <span className="text-[#8f8d87]">(optional)</span>
                </span>
                <input
                  value={newProduct.sellingPrice}
                  onChange={(e) => {
                    const sellingPrice = e.target.value.replace(/[^\d.]/g, "");
                    setNewProduct((d) => (d ? { ...d, sellingPrice } : d));
                  }}
                  inputMode="decimal"
                  placeholder="৳ 0.00"
                  aria-label="Selling price"
                  className={MODAL_INPUT}
                />
              </label>
            </div>

            <div className="flex flex-col gap-[12px] sm:flex-row">
              <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <span className="text-[14px] font-medium text-[#525252]">
                  SKU <span className="text-[#8f8d87]">(optional)</span>
                </span>
                <input
                  value={newProduct.sku}
                  onChange={(e) => {
                    const sku = e.target.value;
                    setNewProduct((d) => (d ? { ...d, sku } : d));
                  }}
                  placeholder="Left blank, the API makes one"
                  aria-label="SKU"
                  className={MODAL_INPUT}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <span className="text-[14px] font-medium text-[#525252]">
                  Barcode <span className="text-[#8f8d87]">(optional)</span>
                </span>
                <input
                  value={newProduct.barcode}
                  onChange={(e) => {
                    const barcode = e.target.value.trim();
                    setNewProduct((d) => (d ? { ...d, barcode } : d));
                  }}
                  placeholder="Scan the packet"
                  aria-label="Barcode"
                  className={MODAL_INPUT}
                />
              </label>
            </div>

            <p className="text-[12px] leading-[1.5] text-[#8a8a8a]">
              This creates a real catalogue product straight away — it appears on Products and at
              the till, not just on this order. What you pay for it goes on the line below; the
              selling price is what you charge, and can wait.
            </p>
            {newError && <p className="text-[13px] text-[#ef4444]">{newError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
