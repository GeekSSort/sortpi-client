"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StockItem } from "@/types/stock";
import { StockService } from "@/services";
import DateField from "@/components/shared/DateField";
import { GOLD_GRADIENT } from "@/components/shared/Modal";

/**
 * Figma: SORTPoint — Add Stock 57:13954.
 *
 * A 565-wide card centred in the 1160 page: 48px head, then a 533-wide form of
 * 88px field blocks (18px label, 8px gap, 56px input) 12px apart, and a
 * full-width Add Stock button 24px below the card.
 */

const WAREHOUSES = ["Main Warehouse", "Branch 1", "Branch 2", "Outlet Store"] as const;

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
  const router = useRouter();
  const [items, setItems] = useState<StockItem[]>([]);
  const [product, setProduct] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [open, setOpen] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    StockService.getStock()
      .then((res) => setItems(res.data))
      .catch(() => {});
  }, []);

  const picked = items.find((i) => i.name === product) ?? null;
  const currentStock = picked?.available ?? 0;
  const newTotal = useMemo(
    () => currentStock + (Number(quantity) || 0),
    [currentStock, quantity]
  );

  const productNames = useMemo(
    () => Array.from(new Set(items.map((i) => i.name))),
    [items]
  );

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
      if (!picked?.variantId || !picked?.warehouseId) {
        throw new Error("That line is missing its variant or warehouse.");
      }
      // A stock adjustment takes the COUNT, not the amount added: the service
      // works out the movement against the balance at the moment it applies.
      await StockService.adjustStock({
        warehouseId: picked.warehouseId,
        variantId: picked.variantId,
        newQuantity: currentStock + qty,
        referenceNo: `ADJ-${Date.now()}`,
        reason: "STOCK_IN",
        note: `Added ${qty} on ${(date ?? new Date()).toISOString().slice(0, 10)}`,
      });
      setNote(`${qty} added to ${product}`);
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
    <div className="flex w-full flex-col select-none">
      <form onSubmit={submit} className="mx-auto flex w-full max-w-[565px] flex-col gap-[24px]">
        <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
          <div className="flex h-[48px] items-center justify-center px-[16px]">
            <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] text-[#1e1e1e]">
              Add Stock
            </p>
          </div>

          {/* Form — 57:13993, 88px blocks 12px apart */}
          <div className="flex flex-col gap-[12px] px-[16px] pt-[9px] pb-[16px]">
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
                options={WAREHOUSES}
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
