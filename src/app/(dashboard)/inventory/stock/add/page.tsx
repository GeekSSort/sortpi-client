"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StockItem } from "@/types/stock";
import { StockService, TransferService } from "@/services";
import { useSession } from "@/services/useSession";
import DateField from "@/components/shared/DateField";
import { GOLD_GRADIENT } from "@/components/shared/Modal";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { FormSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";

/**
 * Figma: SortPi — Add Stock 57:13954.
 *
 * A 565-wide card centred in the 1160 page: 48px head, then a 533-wide form of
 * 88px field blocks (18px label, 8px gap, 56px input) 12px apart, and a
 * full-width Add Stock button 24px below the card.
 */

// The warehouse list comes from `/warehouses/`. It used to be four invented
// names — "Main Warehouse", "Branch 1" — so the dropdown offered places this
// company does not have, and the choice could not be resolved to the id the
// adjustment has to be posted against.

const LABEL = "w-full text-[18px] leading-[24px] font-medium text-[#525252]";
const FIELD =
  "flex h-[56px] w-full items-center rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[8px]";
const INPUT =
  "min-w-px flex-1 bg-transparent text-[16px] leading-[24px] font-normal text-[#525252] outline-none placeholder:text-[#525252]";

function Caret() {
  return (
    <svg className="block size-[24px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16C11.7663 16.0005 11.5399 15.9191 11.36 15.77L5.36 10.77C5.15578 10.6003 5.02736 10.3564 5.00298 10.0919C4.9786 9.8275 5.06026 9.56422 5.23 9.36C5.39974 9.15578 5.64365 9.02736 5.90808 9.00298C6.1725 8.9786 6.43578 9.06026 6.64 9.23L12 13.71L17.36 9.39C17.4623 9.30693 17.58 9.2449 17.7063 9.20747C17.8327 9.17004 17.9652 9.15795 18.0962 9.17188C18.2272 9.18582 18.3542 9.22552 18.4698 9.28873C18.5854 9.35194 18.6874 9.43738 18.77 9.54C18.8531 9.64229 18.9151 9.75999 18.9525 9.88634C18.99 10.0127 19.002 10.1452 18.9881 10.2762C18.9742 10.4072 18.9345 10.5342 18.8713 10.6498C18.8081 10.7654 18.7226 10.8674 18.62 10.95L12.62 15.78C12.4408 15.9159 12.2242 15.9931 12 16Z"
        fill="currentColor"
      />
    </svg>
  );
}

type Kind = "product" | "warehouse";

/** Dropdown in the same 56px shell as the text inputs. */
function Select({
  kind,
  value,
  placeholder,
  options,
  onPick,
  open,
  setOpen,
}: {
  kind: Kind;
  value: string;
  placeholder: string;
  options: readonly string[];
  onPick: (v: string) => void;
  open: Kind | null;
  setOpen: React.Dispatch<React.SetStateAction<Kind | null>>;
}) {
  return (
    <div className="relative w-full">
      <button
        type="button"
        aria-expanded={open === kind}
        aria-label={placeholder}
        onClick={() => setOpen(open === kind ? null : kind)}
        onBlur={() => window.setTimeout(() => setOpen((o) => (o === kind ? null : o)), 130)}
        className={`${FIELD} cursor-pointer justify-between text-left`}
      >
        <span className="truncate text-[16px] leading-[24px] text-[#525252]">{value || placeholder}</span>
        <span className="text-[#525252]">
          <Caret />
        </span>
      </button>
      {open === kind && (
        <div className="absolute top-[60px] right-0 left-0 z-40 max-h-[220px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
          {options.length === 0 && (
            <p className="px-[14px] py-[10px] text-[13px] text-[#525252]">Nothing to choose yet.</p>
          )}
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onPick(o);
                setOpen(null);
              }}
              className={`block w-full cursor-pointer px-[14px] py-[9px] text-left text-[14px] transition-colors hover:bg-[#fafafa] ${
                o === value ? "font-medium text-[#f5b800]" : "text-[#525252]"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AddStockPage() {
  const session = useSession();
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [open, setOpen] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** What the units cost. Only asked for, and only sent, when the shelf being
      counted into is EMPTY — see `needsCost`. */
  const [unitCost, setUnitCost] = useState("");

  const stockQuery = useQuery(queryKey("stock", { part: "picker" }), () =>
    StockService.getStock()
  );
  // Shared with Transfers, which offers the same two ends.
  const warehouseQuery = useQuery(queryKey("warehouses"), () =>
    TransferService.getWarehouses()
  );

  // Memoised because `?? []` is a new array every render, and the derived
  // lists below depend on them.
  const items: StockItem[] = useMemo(() => stockQuery.data?.data ?? [], [stockQuery.data]);
  // THIS branch's shelves. `/warehouses/` lists every branch the caller is
  // assigned to — that is what the transfer screen needs, to have somewhere to
  // send to — but counting stock in happens where you are standing, and the
  // API refuses an adjustment against another branch's warehouse while a
  // branch is active. Offering one would be offering a 404.
  const warehouses = useMemo(() => {
    const all = warehouseQuery.data ?? [];
    const branchId = session.user?.activeBranch?.id;
    if (!branchId) return all;
    const here = all.filter((w) => w.branchId === branchId);
    return here.length > 0 ? here : all;
  }, [warehouseQuery.data, session.user?.activeBranch?.id]);

  const warehouseId = warehouses.find((w) => w.name === warehouse)?.id ?? null;
  // The variant is a property of the product; the shelf being counted is the
  // one that was picked. Reading the quantity off the first line that happened
  // to match the name added stock to whichever warehouse came back first.
  const lineForProduct = items.find((i) => i.name === product) ?? null;
  const lineAtWarehouse =
    warehouseId === null
      ? null
      : items.find((i) => i.name === product && i.warehouseId === warehouseId) ?? null;
  const picked = lineAtWarehouse ?? lineForProduct;
  // On the shelf, not what is sellable. `available` is this minus what is
  // spoken for, and adding against it would write the reserved units off.
  const currentStock = lineAtWarehouse?.quantity ?? 0;
  const newTotal = useMemo(
    () => currentStock + (Number(quantity) || 0),
    [currentStock, quantity]
  );

  /**
   * Whether this add has to state a unit cost.
   *
   * Weighted-average costing: units joining a line inherit that line's average,
   * and a shelf that has never held this product has none. The API refuses the
   * apply with `ADJUSTMENT_COST_REQUIRED` rather than let the first sale
   * compute COGS against zero, so the form asks first instead of failing after.
   */
  const needsCost = (lineAtWarehouse?.averageCost ?? 0) <= 0;

  const productNames = useMemo(
    () => Array.from(new Set(items.map((i) => i.name))),
    [items]
  );
  const warehouseNames = useMemo(() => warehouses.map((w) => w.name), [warehouses]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!product) return setError("Pick a product.");
    if (!warehouse) return setError("Pick a warehouse.");
    const qty = Number(quantity);
    if (!quantity.trim() || Number.isNaN(qty) || qty <= 0)
      return setError("Enter a quantity greater than zero.");
    setError(null);
    setSaving(true);
    try {
      if (!picked?.variantId) {
        throw new Error("That product is missing its variant.");
      }
      if (!warehouseId) {
        throw new Error("That warehouse could not be resolved. Pick it again.");
      }
      const cost = Number(unitCost);
      if (needsCost && (!unitCost.trim() || Number.isNaN(cost) || cost <= 0)) {
        throw new Error("Enter what one unit cost, greater than zero.");
      }
      /**
       * The live figure, read now — not the one this form has been holding.
       *
       * This screen means "add 10" and the endpoint takes an absolute count, so
       * the two are bridged by `live + 10`. That bridge is only sound if `live`
       * is live: the number came off a stock list fetched when the page opened,
       * and a till goes on selling while somebody fills in a form. Three units
       * sold in between made "add 10 to 100" arrive as 110 against a shelf of
       * 97 — and the service, correctly for a COUNT, drove stock to 110 and put
       * the three sales back.
       *
       * `expectUnchanged` closes what is left: between this read and the apply
       * the balance can still move, and the API then refuses with
       * ADJUSTMENT_STOCK_MOVED rather than writing a figure computed against a
       * shelf that no longer exists.
       */
      const live = await StockService.liveLine(picked.variantId, warehouseId);
      const onShelf = live?.quantity ?? 0;
      if (live && live.quantity !== currentStock) {
        setNote(`${product} now shows ${live.quantity} in stock — adding ${qty} to that.`);
      }

      await StockService.adjustStock({
        warehouseId,
        variantId: picked.variantId,
        newQuantity: onShelf + qty,
        // What this form just read. Without it `expectUnchanged` has nothing to
        // compare against and the guard is inert.
        expectedQuantity: onShelf,
        ...(needsCost ? { unitCost: cost } : {}),
        referenceNo: `ADJ-${Date.now()}`,
        // CORRECTION — goods arriving without a purchase order. "STOCK_IN"
        // was not an AdjustmentReason at all, so this form 400'd on every
        // submit.
        reason: "CORRECTION",
        // This is an ADD, not a count: nobody walked the shelf.
        expectUnchanged: true,
        note: `Added ${qty} on ${(date ?? new Date()).toISOString().slice(0, 10)}`,
      });
      setNote(`${qty} added to ${product}`);
      // The movement is the same one Stock, Products, Transfers and the
      // dashboard are each counting, so all four go stale together.
      invalidate("stock", "inventory", "transfers", "dashboard", "pos-products");
      window.setTimeout(() => router.push("/inventory/stock"), 700);
    } catch (err) {
      // The server names the real problem — an out-of-scope warehouse, a
      // missing permission — and that is more use than "try again".
      setError(
        err instanceof Error && err.message ? err.message : "Could not add the stock. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col">
      <form onSubmit={submit} className="mx-auto flex w-full max-w-[720px] flex-col gap-[24px]">
        <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
          <div className="flex h-[60px] items-center justify-center px-[16px]">
            <h1 className="text-[20px] leading-[28px] font-semibold tracking-[-0.4px] text-[#1e1e1e]">
              Add Stock
            </h1>
          </div>

          {/* Form — 57:13993, 88px blocks 12px apart */}
          <div className="relative flex flex-col gap-[12px] px-[16px] pt-[9px] pb-[16px]">
            <RefreshBar active={stockQuery.fetching || warehouseQuery.fetching} />
            <QueryBoundary
              loading={stockQuery.loading || warehouseQuery.loading}
              error={stockQuery.error ?? warehouseQuery.error}
              hasData={stockQuery.data !== undefined && warehouseQuery.data !== undefined}
              skeleton={<FormSkeleton fields={6} columns={1} />}
              errorMessage="The product and warehouse lists could not be loaded."
              onRetry={() => {
                void stockQuery.refetch();
                void warehouseQuery.refetch();
              }}
            >
            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>Select Product</span>
              <Select
                kind="product"
                value={product}
                placeholder="Select product name"
                options={productNames}
                onPick={(v) => {
                  setProduct(v);
                  setError(null);
                }}
                open={open}
                setOpen={setOpen}
              />
            </div>

            {/* SKU follows the product, so it is read-only — 57:14051 */}
            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>SKU</span>
              <div className={FIELD}>
                <output aria-label="SKU" className="min-w-px flex-1 truncate text-[16px] leading-[24px] text-[#525252]">
                  {picked?.sku || "Select a product first"}
                </output>
              </div>
            </div>

            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>Warehouse</span>
              <Select
                kind="warehouse"
                value={warehouse}
                placeholder="Select warehouse"
                options={warehouseNames}
                onPick={(v) => {
                  setWarehouse(v);
                  setError(null);
                }}
                open={open}
                setOpen={setOpen}
              />
            </div>

            {/* 57:14010 — two columns, 30px apart */}
            <div className="flex flex-col gap-[30px] sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <span className={LABEL}>Current Stock</span>
                <div className={FIELD}>
                  <output aria-label="Current stock" className="min-w-px flex-1 text-[16px] leading-[24px] text-[#525252]">
                    {currentStock}
                  </output>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <label htmlFor="s-qty" className={LABEL}>Add Quantity</label>
                <div className={FIELD}>
                  <input
                    id="s-qty"
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(e.target.value.replace(/[^\d]/g, ""));
                      setError(null);
                    }}
                    inputMode="numeric"
                    placeholder="Enter quantity"
                    className={INPUT}
                  />
                </div>
              </div>
            </div>

            {/* Only when the shelf is empty. On a line that already holds
                stock the new units inherit its average and there is nothing to
                ask. */}
            {needsCost && (
              <div className="flex flex-col gap-[8px]">
                <label htmlFor="s-cost" className={LABEL}>
                  Cost per unit
                </label>
                <div className={FIELD}>
                  <input
                    id="s-cost"
                    value={unitCost}
                    onChange={(e) => {
                      setUnitCost(e.target.value.replace(/[^\d.]/g, ""));
                      setError(null);
                    }}
                    inputMode="decimal"
                    placeholder="৳ 0.00"
                    className={INPUT}
                  />
                </div>
                <p className="text-[13px] leading-[1.5] text-[#8f8d87]">
                  This shelf has never held {product || "this product"}, so there is no cost for
                  the new units to inherit. What the shop PAID, not the selling price.
                </p>
              </div>
            )}

            {/* Derived — 57:14055 */}
            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>New Total Stock</span>
              <div className={FIELD}>
                <output aria-label="New total stock" className="min-w-px flex-1 text-[16px] leading-[24px] text-[#525252]">
                  {quantity.trim() === "" ? "Current Stock + Add Quantity" : newTotal}
                </output>
              </div>
            </div>

            {/* 57:14030 */}
            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>Date</span>
              <DateField value={date} onChange={setDate} ariaLabel="Stock date" fullWidth />
            </div>

            {error && <p className="text-[13px] text-[#ef4444]">{error}</p>}
            {note && <p className="text-[13px] text-[#525252]">{note}</p>}
            </QueryBoundary>
          </div>
        </div>

        {/* 57:14039 — outside the card */}
        <button
          type="submit"
          disabled={saving}
          style={{ backgroundImage: GOLD_GRADIENT }}
          className="flex h-[48px] w-full cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add Stock"}
        </button>
      </form>
    </div>
  );
}
