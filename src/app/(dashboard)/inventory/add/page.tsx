"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InventoryService } from "@/services";
import type { CatalogOption, CatalogOptions } from "@/services/inventoryService";
import { GOLD_GRADIENT } from "@/components/shared/Modal";
import UploadIcon from "@/components/shared/UploadIcon";
import { useQuery, queryKey, useMutation, invalidate } from "@/lib/query/useQuery";
import { FormSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import ProductImage from "@/components/shared/ProductImage";
import { readDiscounts, writeDiscounts } from "@/lib/posDiscounts";

/**
 * Figma: SORTPoint — Add New Product 57:12014.
 *
 * A 565-wide card centred in the 1160 page: 48px head, then a 533-wide form of
 * 88px field blocks (18px label, 8px gap, 56px input) 12px apart, and a
 * full-width Save Product button 24px below the card.
 */

// The category, brand, unit and tax lists come from the catalogue. They used
// to be hardcoded names — five categories and eight brands with nothing to do
// with this shop — so nothing the form offered could be resolved to an id, and
// every save was refused.

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

const LABEL = "w-full text-[18px] leading-[24px] font-medium text-[#525252]";
const FIELD =
  "flex h-[56px] w-full items-center rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[8px]";
const INPUT =
  "min-w-px flex-1 bg-transparent text-[16px] leading-[24px] font-normal text-[#525252] outline-none placeholder:text-[#525252]";

const blank = {
  name: "",
  category: "",
  brand: "",
  unit: "",
  sku: "",
  barcode: "",
  purchasePrice: "",
  sellingPrice: "",
  discount: "",
  tax: "",
  image: "",
};

/** Off the price, or onto it: a share of it, or a fixed number of taka. */
type Rate = "percent" | "flat";

/** Tax and discount are each a number plus which kind of number it is. */
const blankRates: { discount: Rate; tax: Rate } = { discount: "percent", tax: "percent" };

type SelectKind = "category" | "brand" | "unit";

/**
 * A number with a % / ৳ switch beside it.
 *
 * Both of these used to be something else — discount a bare box whose unit
 * nobody stated, tax a dropdown of rows a shop had to create elsewhere first —
 * so neither could express "৳20 off" or "7.5% VAT we have not set up yet".
 */
function RateField({
  id,
  label,
  value,
  mode,
  onValue,
  onMode,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  mode: Rate;
  onValue: (v: string) => void;
  onMode: (m: Rate) => void;
  hint?: string;
}) {
  const TAB =
    "flex h-[36px] min-w-[38px] cursor-pointer items-center justify-center rounded-[8px] px-[10px] text-[14px] font-medium transition-colors";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className={`${FIELD} gap-[8px] pr-[8px]`}>
        <input
          id={id}
          value={value}
          onChange={(e) => onValue(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          placeholder="0"
          className={INPUT}
        />
        <div className="flex shrink-0 items-center gap-[4px] rounded-[9px] bg-[#fafafa] p-[2px]">
          {(["percent", "flat"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              aria-pressed={mode === m}
              aria-label={m === "percent" ? `${label} as a percentage` : `${label} in taka`}
              className={`${TAB} ${
                mode === m ? "bg-white text-[#1e1e1e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#8f8d87]"
              }`}
            >
              {m === "percent" ? "%" : "৳"}
            </button>
          ))}
        </div>
      </div>
      {hint && <p className="text-[12px] leading-[16px] text-[#8f8d87]">{hint}</p>}
    </div>
  );
}

/** The shared dropdown field: same 56px shell as the text inputs. */
function Select({
  kind,
  value,
  placeholder,
  options,
  onPick,
  open,
  setOpen,
}: {
  kind: SelectKind;
  /** The picked option's ID, not its name — an id is what the API takes. */
  value: string;
  placeholder: string;
  options: readonly CatalogOption[];
  onPick: (id: string) => void;
  open: SelectKind | null;
  setOpen: React.Dispatch<React.SetStateAction<SelectKind | null>>;
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
        <span className="truncate text-[16px] leading-[24px] text-[#525252]">
          {options.find((o) => o.id === value)?.name || placeholder}
        </span>
        <span className="text-[#525252]">
          <Caret />
        </span>
      </button>
      {open === kind && (
        <div className="absolute top-[60px] right-0 left-0 z-40 max-h-[220px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
          {options.length === 0 && (
            <p className="px-[14px] py-[9px] text-[14px] text-[#8f8d87]">Nothing to choose yet.</p>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onPick(o.id);
                setOpen(null);
              }}
              className={`block w-full cursor-pointer px-[14px] py-[9px] text-left text-[14px] transition-colors hover:bg-[#fafafa] ${
                o.id === value ? "font-medium text-[#f5b800]" : "text-[#525252]"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AddProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({ ...blank });
  const [rates, setRates] = useState({ ...blankRates });
  const [open, setOpen] = useState<SelectKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The bytes to upload once the product exists and has an id. */
  const [imageFile, setImageFile] = useState<File | null>(null);

  // The catalogue is the same for every screen that offers these lists, so it
  // is read through the shared cache rather than re-fetched on each visit.
  const catalog = useQuery(queryKey("inventory", { part: "catalog" }), () =>
    InventoryService.getCatalogOptions()
  );
  const options: CatalogOptions = catalog.data ?? {
    categories: [],
    brands: [],
    units: [],
    taxes: [],
  };

  // A shop with one unit should not have to pick it every time. Derived rather
  // than written into the form by an effect: an effect would have to wait for
  // a render, so the field flashed empty on the way past.
  const unit = form.unit || (options.units.length === 1 ? options.units[0].id : "");

  const { mutate: createProduct, pending: saving } = useMutation(
    (payload: Parameters<typeof InventoryService.createProduct>[0]) =>
      InventoryService.createProduct(payload),
    // A new product is a new row in Products, a new line in Stock and one more
    // item in the dashboard's counts.
    { invalidates: ["inventory", "stock", "dashboard", "pos-products"] }
  );

  const set = (k: keyof typeof blank, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };

  /** Selling price less the discount, plus tax on the remainder.
   *
   * Each of the two is a percentage or a flat number of taka, so the switch
   * beside the box decides the arithmetic. `form.tax` used to hold a tax row's
   * UUID and this read `Number(form.tax)` — always NaN, so the preview never
   * once included tax. */
  const finalPrice = useMemo(() => {
    const sell = Number(form.sellingPrice) || 0;
    const discEntered = Math.max(0, Number(form.discount) || 0);
    const taxEntered = Math.max(0, Number(form.tax) || 0);

    const discountOff =
      rates.discount === "percent"
        ? (sell * Math.min(100, discEntered)) / 100
        : Math.min(sell, discEntered);
    const afterDiscount = Math.max(0, sell - discountOff);
    const taxOn =
      rates.tax === "percent" ? (afterDiscount * taxEntered) / 100 : taxEntered;
    return afterDiscount + taxOn;
  }, [form.sellingPrice, form.discount, form.tax, rates]);

  /**
   * The FILE is kept, not just a preview URL of it.
   *
   * This used to call `URL.createObjectURL` and nothing else, so the picture
   * appeared on the form, survived until the page navigated, and was never
   * uploaded — which is why no product in the catalogue had an image.
   */
  const pickImage = (file?: File) => {
    if (!file) return;
    setImageFile(file);
    setForm((f) => ({ ...f, image: URL.createObjectURL(file) }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) return setError("Product name is required.");
    if (!form.category) return setError("Pick a category.");
    // Brand is optional on the API, so it is optional here. Unit is not.
    if (!unit) return setError("Pick a unit.");
    if (!Number(form.sellingPrice)) return setError("Selling price must be greater than zero.");
    try {
      // A typed percentage has to become a Tax row before it can be a foreign
      // key. A flat tax has no column on this API at all — `Tax.rate` is a
      // percentage — so it is left off the product and priced on screen only.
      let taxId: string | undefined;
      const taxRate = Math.max(0, Number(form.tax) || 0);
      if (rates.tax === "percent" && taxRate > 0) {
        try {
          taxId = await InventoryService.resolveTax(taxRate, options.taxes);
        } catch {
          // Not fatal: a product without a tax row is a product, and refusing
          // to save one over its VAT would be the worse trade.
          setNote("The tax rate could not be saved; the product will have none.");
        }
      }

      const created = await createProduct({
        name: form.name.trim(),
        categoryId: form.category,
        unitId: unit,
        brandId: form.brand || undefined,
        taxId,
        sellingPrice: Number(form.sellingPrice),
        purchasePrice: Number(form.purchasePrice) || undefined,
        sku: form.sku.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
      });
      // The image can only be attached once the product has an id, so it goes
      // after the create rather than in the same request. A failure here is
      // reported without pretending the product was not saved — it was.
      if (imageFile) {
        setNote(`${created.name} saved — uploading image…`);
        try {
          await InventoryService.uploadProductImage(created.id, imageFile);
          invalidate("inventory", "pos-products");
        } catch (imgErr) {
          setError(
            imgErr instanceof Error && imgErr.message
              ? `Product saved, but the image did not upload: ${imgErr.message}`
              : "Product saved, but the image did not upload."
          );
          return;
        }
      }
      // A discount typed here is the till's product offer — the same store the
      // Discounts screen writes and the POS prices its tiles by. Keyed by the
      // variant, which is what everything at the till is keyed by.
      const discountValue = Math.max(0, Number(form.discount) || 0);
      if (discountValue > 0 && created.variantId) {
        writeDiscounts({
          ...readDiscounts(),
          [created.variantId]: { mode: rates.discount, value: discountValue },
        });
      }

      setNote(`${created.name} saved`);
      window.setTimeout(() => router.push("/inventory"), 700);
    } catch (err) {
      // The server names the real problem — a duplicate SKU, a missing
      // permission — and that is more use than "try again".
      setError(
        err instanceof Error && err.message ? err.message : "Could not save the product."
      );
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Centred 565 column — 57:12578 */}
      <form onSubmit={save} className="mx-auto flex w-full max-w-[565px] flex-col gap-[24px]">
        <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
          <div className="flex h-[48px] items-center justify-center px-[16px]">
            <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] text-[#1e1e1e]">
              Add New Product
            </p>
          </div>

          {/* Form — 57:12584, 88px blocks 12px apart */}
          <div className="relative flex flex-col gap-[12px] px-[16px] pt-[9px] pb-[16px]">
            <RefreshBar active={catalog.fetching} />
            <QueryBoundary
              loading={catalog.loading}
              error={catalog.error}
              hasData={catalog.data !== undefined}
              skeleton={<FormSkeleton fields={8} columns={1} />}
              errorMessage="The category, unit and tax lists could not be loaded."
              onRetry={catalog.refetch}
            >
            <div className="flex flex-col gap-[8px]">
              <label htmlFor="p-name" className={LABEL}>Product Name</label>
              <div className={FIELD}>
                <input
                  id="p-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Enter product name"
                  className={INPUT}
                />
              </div>
            </div>

            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>Category</span>
              <Select kind="category" value={form.category} placeholder="Select product category" options={options.categories} onPick={(v) => set("category", v)} open={open} setOpen={setOpen} />
            </div>

            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>Brand</span>
              <Select kind="brand" value={form.brand} placeholder="Select product brand (optional)" options={options.brands} onPick={(v) => set("brand", v)} open={open} setOpen={setOpen} />
            </div>

            {/* Unit is a required foreign key on the API; SKU is the one
                write-only convenience worth exposing, since a shop labels its
                own shelves. */}
            <div className="flex flex-col gap-[30px] sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <span className={LABEL}>Unit</span>
                <Select kind="unit" value={unit} placeholder="Select unit" options={options.units} onPick={(v) => set("unit", v)} open={open} setOpen={setOpen} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <label htmlFor="p-sku" className={LABEL}>SKU <span className="text-[#8f8d87]">(optional)</span></label>
                <div className={FIELD}>
                  <input id="p-sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Left blank, the API makes one" className={INPUT} />
                </div>
              </div>
            </div>

            {/* The till scans this. Without it a product can only be rung up
                by finding it on the wall, which is the slow path the scanner
                exists to replace. The input is a scan target: focus it and
                pull the trigger. */}
            <div className="flex flex-col gap-[8px]">
              <label htmlFor="p-barcode" className={LABEL}>
                Barcode <span className="text-[#8f8d87]">(optional)</span>
              </label>
              <div className={FIELD}>
                <input
                  id="p-barcode"
                  value={form.barcode}
                  onChange={(e) => set("barcode", e.target.value.trim())}
                  placeholder="Scan or type the barcode on the packet"
                  className={INPUT}
                />
              </div>
            </div>

            {/* 57:12790 — two columns, 30px apart */}
            <div className="flex flex-col gap-[30px] sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <label htmlFor="p-purchase" className={LABEL}>Purchase Price</label>
                <div className={FIELD}>
                  <input id="p-purchase" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="৳ 0.00" className={INPUT} />
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <label htmlFor="p-selling" className={LABEL}>Selling Price</label>
                <div className={FIELD}>
                  <input id="p-selling" value={form.sellingPrice} onChange={(e) => set("sellingPrice", e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="৳ 0.00" className={INPUT} />
                </div>
              </div>
            </div>

            {/* 57:12800 — a number and its unit, twice. Tax was a dropdown of
                rows the shop had to create in Settings first, so a rate it had
                not set up could not be typed at all. */}
            <div className="flex flex-col gap-[30px] sm:flex-row sm:items-start">
              <RateField
                id="p-discount"
                label="Discount"
                value={form.discount}
                mode={rates.discount}
                onValue={(v) => set("discount", v)}
                onMode={(m) => setRates((r) => ({ ...r, discount: m }))}
                hint="The till's offer on this product."
              />
              <RateField
                id="p-tax"
                label="Tax / VAT"
                value={form.tax}
                mode={rates.tax}
                onValue={(v) => set("tax", v)}
                onMode={(m) => setRates((r) => ({ ...r, tax: m }))}
                hint={
                  rates.tax === "percent"
                    ? "Saved as the shop's tax rate for this product."
                    : "A flat tax is priced here only — the API stores a percentage."
                }
              />
            </div>

            {/* Derived, so read-only — 57:12823 */}
            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>Final Price</span>
              <div className={FIELD}>
                <output aria-label="Final price" className="min-w-px flex-1 text-[16px] leading-[24px] text-[#525252]">
                  ৳ {finalPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </output>
              </div>
            </div>

            {/* Upload — 57:13796 */}
            <label className="flex h-[56px] w-full cursor-pointer items-center justify-center gap-[10px] rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[8px] transition-colors hover:bg-[#fafafa]">
              {form.image ? (
                <>
                  <span className="relative size-[32px] shrink-0 overflow-hidden rounded-[6px]">
                    <ProductImage src={form.image} alt="" sizes="32px" />
                  </span>
                  <span className="text-[16px] leading-[24px] text-[#525252]">Image selected</span>
                </>
              ) : (
                <>
                  <span className="text-[#525252]">
                    <UploadIcon />
                  </span>
                  <span className="w-[106px] text-center text-[16px] leading-[24px] text-[#525252]">
                    Upload Image
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label="Upload image"
                onChange={(e) => pickImage(e.target.files?.[0])}
                className="hidden"
              />
            </label>

            {error && <p className="text-[13px] text-[#ef4444]">{error}</p>}
            {note && <p className="text-[13px] text-[#525252]">{note}</p>}
            </QueryBoundary>
          </div>
        </div>

        {/* Save — 57:12599, outside the card */}
        <button
          type="submit"
          disabled={saving}
          style={{ backgroundImage: GOLD_GRADIENT }}
          className="flex h-[48px] w-full cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Product"}
        </button>
      </form>
    </div>
  );
}
