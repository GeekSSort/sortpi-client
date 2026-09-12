"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InventoryService, SettingsService, StockService, TransferService } from "@/services";
import type { CatalogOption, CatalogOptions } from "@/services/inventoryService";
import { GOLD_GRADIENT } from "@/components/shared/Modal";
import UploadIcon from "@/components/shared/UploadIcon";
import ProgressModal from "@/components/shared/ProgressModal";
import { useQuery, queryKey, useMutation, invalidate } from "@/lib/query/useQuery";
import { FormSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import ProductImage from "@/components/shared/ProductImage";
import { DiscountService } from "@/services/discountService";
import { useSession } from "@/services/useSession";
import { ACTIVE_STOCK_TYPE_KEY } from "@/lib/stockTypes";

/**
 * Figma: SortPi — Add New Product 57:12014.
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
/**
 * The label inside a repeated row.
 *
 * The form's own LABEL, one step down. Five 18px labels per variant, repeated
 * down the page, read louder than the section heading they sit under — and the
 * first version of this section skipped labels entirely and relied on
 * placeholders, which vanish the moment anything is typed into them.
 */
const SUBLABEL = "w-full text-[15px] leading-[20px] font-medium text-[#525252]";
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
  openingStock: "",
  discount: "",
  tax: "",
  image: "",
};

/**
 * One size, colour or form this product is sold in.
 *
 * Empty by default, and an empty list is the ordinary product: one thing sold
 * one way, saved with exactly the payload this form has always sent. A shop
 * only meets these by pressing "Sold in several sizes", which is the moment it
 * actually has a second one.
 *
 * Each row carries its own SKU, prices and opening stock because two sizes are
 * two things on a shelf — counted apart, scanned apart, charged apart. Folding
 * them into one product with one price is what made stock against a non-default
 * variant unreachable from every screen in the app.
 */
type VariantRow = {
  /** A key for React, not sent. Rows have no id until the server makes them. */
  key: string;
  name: string;
  sku: string;
  /** The code on THIS packet. A 250ml and a 1L carry different numbers. */
  barcode: string;
  purchasePrice: string;
  sellingPrice: string;
  openingStock: string;
};

const blankVariant = (): VariantRow => ({
  key: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  sku: "",
  barcode: "",
  purchasePrice: "",
  sellingPrice: "",
  openingStock: "",
});

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
        /* The purpose AND the choice. The label used to be the placeholder
           alone, which overrides the button's visible text — so a screen
           reader announced "Select unit" whether nothing was picked or
           Kilogram was, and there was no way to hear the current value. */
        aria-label={
          options.find((o) => o.id === value)
            ? `${placeholder} — ${options.find((o) => o.id === value)?.name}`
            : placeholder
        }
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
  const session = useSession();
  const [form, setForm] = useState({ ...blank });

  /**
   * The shelf opening stock is counted onto: the ACTIVE branch's own warehouse.
   *
   * `/warehouses/` lists every branch the user can reach, so taking the first
   * would count a Dhaka delivery into Chattogram whenever the list happened to
   * sort that way. MAIN is preferred, since that is where a shop's goods live
   * and where the till sells from. With no active branch there is no answer,
   * and the field says so rather than guessing.
   */
  const { data: warehouseRows } = useQuery(queryKey("warehouses"), () =>
    TransferService.getWarehouses()
  );
  const openingShelf = useMemo(() => {
    const here = (warehouseRows ?? []).filter(
      (w) => w.branchId === session.user?.activeBranch?.id
    );
    return here.find((w) => w.type === "MAIN") ?? here[0] ?? null;
  }, [warehouseRows, session.user?.activeBranch?.id]);
  const openingWarehouse = openingShelf?.id ?? "";
  const openingWarehouseName = openingShelf?.name ?? "";
  const [rates, setRates] = useState({ ...blankRates });
  /**
   * The sizes this product is sold in. Empty means "one thing, one way".
   *
   * Held as strings for the same reason every money box on this form is: a
   * controlled number round-trips through Number() on each keystroke, so "2."
   * loses its dot as it is typed.
   */
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const hasVariants = variants.length > 0;
  const patchVariant = (key: string, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
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

  // How this shop quotes prices, so the preview below says what the till will
  // actually charge rather than a figure no screen agrees with.
  // `scope: "values"` — the key the till and every other reader of the
  // resolved settings already use. This page asked under `part: "values"`,
  // which is the same request held in a second cache entry.
  const { data: shopValues } = useQuery(queryKey("settings", { scope: "values" }), () =>
    SettingsService.getValues()
  );
  const vatIncluded =
    String(shopValues?.["tax.inclusive_by_default"] ?? "true") !== "false";
  const options: CatalogOptions = catalog.data ?? {
    categories: [],
    brands: [],
    units: [],
    taxes: [],
  };

  /**
   * Which stock type this product starts in.
   *
   * Three answers in order, and the order is the point:
   *
   *   1. what the shopkeeper picked on this form — never overridden;
   *   2. the shop's ACTIVE stock type, set once in Settings, which is what a
   *      shop that only weighs things sets so it stops answering this;
   *   3. the only stock type there is, when there is only one.
   *
   * A default and not a restriction: the picker is still there and still
   * required, because a shop that sells bottles AND cloth has to be able to
   * say which this one is.
   *
   * Derived rather than written into the form by an effect — an effect has to
   * wait for a render, so the field flashed empty on the way past.
   */
  const activeUnitId = String(shopValues?.[ACTIVE_STOCK_TYPE_KEY] ?? "");
  const unit =
    form.unit ||
    // Only if it still exists: a stock type can be deleted after being made
    // active, and an id matching nothing in the list reads as a broken picker.
    (options.units.some((u) => u.id === activeUnitId) ? activeUnitId : "") ||
    (options.units.length === 1 ? options.units[0].id : "");

  /**
   * Which step of the save is running, and how many there are.
   *
   * Saving a product is not one request. It is up to four — resolve the tax,
   * create the product, count the opening stock, upload the image — and the
   * image is the slow one. All of that used to happen behind a button that
   * said "Saving…", so a form that took eight seconds was indistinguishable
   * from one that had hung, and the honest reaction is to press it again.
   *
   * The steps are counted BEFORE the work starts, from what the form actually
   * contains, so the bar measures this save rather than a generic one.
   */
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(
    null
  );

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

  /** What the customer will actually pay, priced the way the till prices it.
   *
   * Each of discount and tax is a percentage or a flat number of taka, so the
   * switch beside the box decides the arithmetic. `form.tax` used to hold a tax
   * row's UUID and this read `Number(form.tax)` — always NaN, so the preview
   * never once included tax.
   *
   * Whether the VAT is ADDED depends on how the shop quotes prices. With
   * tax-inclusive pricing — the Bangladeshi retail default, and the shop's
   * `tax.inclusive_by_default` setting — the shelf price already contains the
   * VAT, so adding it again quoted a "final price" 15% above what the till
   * would ever charge and the two screens disagreed about the same product. */
  const finalPrice = useMemo(() => {
    const sell = Number(form.sellingPrice) || 0;
    const discEntered = Math.max(0, Number(form.discount) || 0);
    const taxEntered = Math.max(0, Number(form.tax) || 0);

    const discountOff =
      rates.discount === "percent"
        ? (sell * Math.min(100, discEntered)) / 100
        : Math.min(sell, discEntered);
    const afterDiscount = Math.max(0, sell - discountOff);
    if (vatIncluded) return afterDiscount;
    const taxOn =
      rates.tax === "percent" ? (afterDiscount * taxEntered) / 100 : taxEntered;
    return afterDiscount + taxOn;
  }, [form.sellingPrice, form.discount, form.tax, rates, vatIncluded]);

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

    /**
     * The rows that will actually be saved.
     *
     * Blank-named ones are dropped rather than refused: pressing "Add another"
     * and changing your mind is not an error, and a row with nothing in it is
     * a row the shopkeeper did not want.
     */
    const rows = variants.filter((v) => v.name.trim().length > 0);

    if (hasVariants && rows.length === 0) {
      return setError(
        "Give each variant a name — 500ml, 1L — or remove the empty rows. A variant with no name " +
          "cannot be told apart from the product itself on the till."
      );
    }
    if (rows.length > 0) {
      // Two variants sharing a name are two tiles a cashier cannot tell apart,
      // and the server would take both.
      const names = rows.map((v) => v.name.trim().toLowerCase());
      const repeated = names.find((n, i) => names.indexOf(n) !== i);
      if (repeated) {
        return setError(
          `Two variants are both called "${repeated}". Each one has to be tellable from the others on the till.`
        );
      }
      const skus = rows.map((v) => v.sku.trim().toLowerCase()).filter(Boolean);
      const repeatedSku = skus.find((c, i) => skus.indexOf(c) !== i);
      if (repeatedSku) {
        return setError(
          `Two variants share the SKU "${repeatedSku}". A SKU is what tells two things apart on a shelf.`
        );
      }
      const unpriced = rows.find((v) => !(Number(v.sellingPrice) > 0));
      if (unpriced) {
        return setError(
          `${unpriced.name.trim()} has no selling price. An unpriced variant reads as "No price" at the till.`
        );
      }
      const costlessCount = rows.find(
        (v) => Number(v.openingStock) > 0 && !(Number(v.purchasePrice) > 0)
      );
      if (costlessCount) {
        return setError(
          `Enter the purchase price for ${costlessCount.name.trim()} before its opening stock. Stock counted ` +
            "in at nothing makes the first sale of it look like pure profit, and that cost is stamped " +
            "once and never recomputed."
        );
      }
      if (rows.some((v) => Number(v.openingStock) > 0) && !openingWarehouse) {
        return setError(
          "There is no warehouse to count these into. Switch to a branch from the header first."
        );
      }
    } else if (!Number(form.sellingPrice)) {
      return setError("Selling price must be greater than zero.");
    }

    // With variants, the single boxes above no longer govern — each row
    // carries its own. Without them, nothing has changed.
    const opening = rows.length > 0 ? 0 : Number(form.openingStock) || 0;
    if (opening > 0 && !(Number(form.purchasePrice) > 0)) {
      return setError(
        "Enter the purchase price before the opening stock. Stock counted in at nothing makes the " +
          "first sale of it look like pure profit, and that cost is stamped once and never recomputed."
      );
    }
    if (opening > 0 && !openingWarehouse) {
      return setError(
        "There is no warehouse to count this into. Switch to a branch from the header first."
      );
    }
    // Counted from what this form actually holds, so the bar measures THIS
    // save. Creating the product is the only step every save has.
    const taxRateForSteps = Math.max(0, Number(form.tax) || 0);
    const willResolveTax = rates.tax === "percent" && taxRateForSteps > 0;
    const willCountStock = opening > 0 && Boolean(openingWarehouse);
    const totalSteps =
      1 + (willResolveTax ? 1 : 0) + (willCountStock ? 1 : 0) + (imageFile ? 1 : 0);
    let step = 0;
    const advance = (label: string) => setProgress({ label, done: step, total: totalSteps });

    try {
      // A typed percentage has to become a Tax row before it can be a foreign
      // key. A flat tax has no column on this API at all — `Tax.rate` is a
      // percentage — so it is left off the product and priced on screen only.
      let taxId: string | undefined;
      const taxRate = Math.max(0, Number(form.tax) || 0);
      if (rates.tax === "percent" && taxRate > 0) {
        advance("Saving the tax rate…");
        try {
          taxId = await InventoryService.resolveTax(taxRate, options.taxes);
        } catch {
          // Not fatal: a product without a tax row is a product, and refusing
          // to save one over its VAT would be the worse trade.
          setNote("The tax rate could not be saved; the product will have none.");
        }
      }

      if (willResolveTax) step += 1;
      advance("Creating the product…");
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
        // Left out entirely for the one-variant case, so the payload is byte
        // for byte what this form has always sent.
        ...(rows.length > 0
          ? {
              variants: rows.map((v, index) => ({
                name: v.name.trim(),
                sku: v.sku.trim() || undefined,
                barcode: v.barcode.trim() || undefined,
                sellingPrice: Number(v.sellingPrice) || undefined,
                purchasePrice: Number(v.purchasePrice) || undefined,
                // The first row is the default: it is what a barcode-less
                // lookup resolves to, and the form labels it so.
                isDefault: index === 0,
              })),
            }
          : {}),
      });
      /**
       * The opening stock, as a counted movement.
       *
       * After the create, because a movement names the VARIANT and the variant
       * does not exist until then — and reported without pretending the product
       * was not saved if it fails, because it was. The alternative, refusing the
       * whole thing, would lose a filled-in form over a permission.
       */
      /**
       * What to count in, and against which variant.
       *
       * Per variant, because stock is: a Coca-Cola created with 250ml, 500ml
       * and 1L has three shelves, and counting the lot against the default
       * would put every bottle in the shop under one size — unsellable as the
       * other two and wrong in the valuation.
       *
       * Matched by NAME rather than by position: the server creates them in
       * the order sent, but relying on that would put one variant's stock on
       * another's shelf the day it stops being true, silently.
       */
      const byName = new Map(
        created.variants.map((v) => [v.name.trim().toLowerCase(), v])
      );
      const counts =
        rows.length > 0
          ? rows
              .map((row) => ({
                variantId: byName.get(row.name.trim().toLowerCase())?.id ?? "",
                label: row.name.trim(),
                quantity: Number(row.openingStock) || 0,
                unitCost: Number(row.purchasePrice) || 0,
              }))
              .filter((c) => c.quantity > 0 && c.variantId)
          : opening > 0 && created.variantId
            ? [
                {
                  variantId: created.variantId,
                  label: created.name,
                  quantity: opening,
                  unitCost: Number(form.purchasePrice),
                },
              ]
            : [];

      if (counts.length > 0 && openingWarehouse) {
        step += 1;
        advance(
          counts.length === 1
            ? "Counting the opening stock…"
            : `Counting the opening stock (${counts.length} variants)…`
        );
        for (const count of counts) {
          try {
            await StockService.adjustStock({
              warehouseId: openingWarehouse,
              variantId: count.variantId,
              newQuantity: count.quantity,
              unitCost: count.unitCost,
              // A brand new variant holds nothing, so this is what the shelf
              // must be at for the count to mean what was typed.
              expectUnchanged: true,
              expectedQuantity: 0,
              // Its own reference per variant: one key covering three counts
              // would make the second and third replays of the first.
              referenceNo: `OPEN-${Date.now().toString().slice(-8)}-${count.variantId.slice(0, 6)}`,
              reason: "CORRECTION",
              note: `Opening stock for ${created.name}${
                count.label && count.label !== created.name ? ` ${count.label}` : ""
              }`,
            });
          } catch (stockErr) {
            // Named, because with several variants "the opening stock" does
            // not say which shelf is still at zero.
            const which =
              counts.length === 1 ? created.name : `${created.name} ${count.label}`;
            setError(
              stockErr instanceof Error && stockErr.message
                ? `${created.name} was saved, but the opening stock for ${which} was not counted in: ${stockErr.message}`
                : `${created.name} was saved, but the opening stock for ${which} was not counted in.`
            );
            invalidate("stock", "inventory", "dashboard", "pos-products");
            return;
          }
        }
        invalidate("stock", "inventory", "dashboard", "pos-products");
      }

      // The image can only be attached once the product has an id, so it goes
      // after the create rather than in the same request. A failure here is
      // reported without pretending the product was not saved — it was.
      if (imageFile) {
        step += 1;
        advance("Uploading the image…");
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
      /**
       * A discount typed here is the till's product offer — the same store the
       * Discounts screen writes and the POS prices its tiles by. Keyed by the
       * VARIANT, which is what everything at the till is keyed by.
       *
       * EVERY variant, not just the default. It used to set the offer on
       * `created.variantId` alone, so "10% off Coca-Cola" on a product with
       * three sizes discounted the 250ml and left the 500ml and the 1L at full
       * price — with nothing on screen saying so. A shopkeeper typing a
       * percentage against a product means the product.
       */
      const discountValue = Math.max(0, Number(form.discount) || 0);
      if (discountValue > 0) {
        try {
          const targets =
            created.variants.length > 0
              ? created.variants.map((v) => v.id)
              : created.variantId
                ? [created.variantId]
                : [];
          for (const variantId of targets) {
            await DiscountService.set(created.id, {
              mode: rates.discount === "flat" ? "FLAT" : "PERCENT",
              value: discountValue,
              variantId,
            });
          }
          invalidate("discounts", "pos-products", "inventory");
        } catch (offerErr) {
          // Not fatal: the product exists and sells at its full price until
          // somebody sets the offer again. Saying it failed to save would send
          // this person to create it a second time.
          setNote(
            offerErr instanceof Error && offerErr.message
              ? `${created.name} saved, but the discount was not: ${offerErr.message}`
              : `${created.name} saved, but the discount was not.`
          );
        }
      }

      step = totalSteps;
      advance("Saved.");
      setNote(`${created.name} saved`);
      window.setTimeout(() => router.push("/inventory"), 700);
    } catch (err) {
      // The server names the real problem — a duplicate SKU, a missing
      // permission — and that is more use than "try again".
      setError(
        err instanceof Error && err.message ? err.message : "Could not save the product."
      );
    } finally {
      // In `finally`, not at the end of the try: every early `return` above is
      // a partial save that has already reported itself, and leaving the bar
      // up over the message explaining what went wrong would hide it behind a
      // dialog that cannot be dismissed.
      setProgress(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      <ProgressModal
        open={progress !== null}
        title="Saving product"
        label={progress?.label ?? ""}
        value={progress ? progress.done / progress.total : null}
        detail={progress ? `Step ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : undefined}
      />

      {/* Centred 565 column — 57:12578 */}
      <form onSubmit={save} className="mx-auto flex w-full max-w-[720px] flex-col gap-[24px]">
        <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
          <div className="flex h-[60px] items-center justify-center px-[16px]">
            <h1 className="text-[20px] leading-[28px] font-semibold tracking-[-0.4px] text-[#1e1e1e]">
              Add New Product
            </h1>
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
              {/* A product-level SKU is the DEFAULT VARIANT's SKU — there is
                  no other place for it to go. Once the product has variants
                  they each carry their own, and two boxes for one code is how
                  the two come to disagree. */}
              {!hasVariants && (
                <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                  <label htmlFor="p-sku" className={LABEL}>SKU <span className="text-[#8f8d87]">(optional)</span></label>
                  <div className={FIELD}>
                    <input id="p-sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Left blank, the API makes one" className={INPUT} />
                  </div>
                </div>
              )}
            </div>

            {/* The packet in your hand: its code, and how many of them arrived.
                Side by side because they are read off the same delivery in one
                motion — scan the barcode, count the case, move on.

                The barcode is a scan target: focus it and pull the trigger.
                Without one a product can only be rung up by finding it on the
                wall, which is the slow path the scanner exists to replace. Left
                empty, the server assigns an internal code of its own.

                The opening stock is written as a real counted movement, not a
                column on the product, because stock has exactly one way into
                this system. It is costed at the Purchase Price above: a line
                counted in at nothing makes the first sale of it look like pure
                profit forever, since COGS is stamped once and never
                recomputed. */}
            {!hasVariants && (
            <div className="flex flex-col gap-[30px] sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <label htmlFor="p-barcode" className={LABEL}>
                  Barcode <span className="text-[#8f8d87]">(optional)</span>
                </label>
                <div className={FIELD}>
                  <input
                    id="p-barcode"
                    value={form.barcode}
                    onChange={(e) => set("barcode", e.target.value.trim())}
                    placeholder="Scan or type the barcode"
                    className={INPUT}
                  />
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <label htmlFor="p-opening" className={LABEL}>
                  Opening Stock <span className="text-[#8f8d87]">(optional)</span>
                </label>
                <div className={FIELD}>
                  <input
                    id="p-opening"
                    value={form.openingStock}
                    onChange={(e) => set("openingStock", e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="0"
                    className={INPUT}
                  />
                </div>
                <p className="text-[12px] leading-[16px] text-[#8f8d87]">
                  {openingWarehouseName
                    ? `Counted into ${openingWarehouseName} at the purchase price.`
                    : "Counted in at the purchase price once a branch is active."}
                </p>
              </div>
            </div>
            )}

            {/* 57:12790 — two columns, 30px apart.

                Hidden once the product has variants, with the barcode, the SKU
                and the opening stock above: every one of them is a VARIANT's
                field with nowhere else to live on a single-variant product.
                Leaving them on screen meant two boxes for one price, and the
                one nearer the top is the one somebody fills in — while the
                rows underneath are the ones that are saved. */}
            {!hasVariants && (
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
            )}

            {/* Variants — the sizes this product is sold in.
                No Figma frame; built in the form's own language, which is what
                the first version of this got wrong: it used 44px fields with
                14px labels next to the form's 56px fields with 18px ones, so
                the section read as a widget pasted into the page rather than
                part of it.

                Collapsed to one button until a shop presses it, because most
                products are one thing sold one way and a table of empty rows
                above every Add Product is a question nobody needed asked. */}
            <div className="flex flex-col gap-[16px]">
              <div className="flex flex-wrap items-center justify-between gap-[12px]">
                <div className="flex min-w-0 flex-col gap-[4px]">
                  <span className={LABEL}>
                    Variants{" "}
                    <span className="text-[#8f8d87]">
                      {hasVariants ? `· ${variants.length}` : "(optional)"}
                    </span>
                  </span>
                  <span className="text-[14px] leading-[20px] text-[#8f8d87]">
                    {hasVariants
                      ? "Each is counted, scanned and charged on its own. The boxes above now apply to the first."
                      : "One size, one price? Leave this alone."}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setVariants((rows) =>
                      rows.length === 0
                        ? // Seeded from what is already typed above, so pressing
                          // this does not throw away a filled-in form.
                          [
                            {
                              ...blankVariant(),
                              sku: form.sku,
                              barcode: form.barcode,
                              purchasePrice: form.purchasePrice,
                              sellingPrice: form.sellingPrice,
                              openingStock: form.openingStock,
                            },
                            blankVariant(),
                          ]
                        : [...rows, blankVariant()]
                    )
                  }
                  className="flex h-[48px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[12px] border border-dashed border-[#d4d4d4] px-[18px] text-[16px] leading-[24px] font-medium text-[#525252] transition-colors hover:border-[#f5b800] hover:bg-[#fffdf5] hover:text-[#1e1e1e]"
                >
                  <span aria-hidden className="text-[18px] leading-none">+</span>
                  {hasVariants ? "Add another" : "Sold in several sizes?"}
                </button>
              </div>

              {hasVariants && (
                <div className="flex flex-col gap-[16px]">
                  {variants.map((row, index) => (
                    <div
                      key={row.key}
                      className="flex flex-col gap-[20px] rounded-[12px] border border-solid border-[#eaeaea] bg-white p-[20px]"
                    >
                      {/* Which row this is, and the one way out of it. */}
                      <div className="flex flex-wrap items-center justify-between gap-[12px] border-b border-solid border-[#f2f2f0] pb-[14px]">
                        <span className="flex min-w-0 items-center gap-[10px]">
                          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[#fafafa] text-[13px] font-semibold text-[#8f8d87]">
                            {index + 1}
                          </span>
                          <span className="truncate text-[16px] leading-[24px] font-medium text-[#1e1e1e]">
                            {row.name.trim() || "Untitled variant"}
                          </span>
                          {index === 0 && (
                            // The one a barcode-less lookup resolves to. Said
                            // here rather than in a tooltip, because "why is
                            // this one different" is asked at a glance.
                            <span
                              title="What the till picks when nothing else is specified"
                              className="shrink-0 rounded-full bg-[#fff8e1] px-[10px] py-[3px] text-[12px] font-semibold text-[#8a6200] ring-1 ring-[#f2e0a8] ring-inset"
                            >
                              Default
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove variant ${index + 1}`}
                          onClick={() =>
                            setVariants((rows) => rows.filter((r) => r.key !== row.key))
                          }
                          className="shrink-0 cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[14px] py-[7px] text-[14px] font-medium text-[#c62828] transition-colors hover:border-[#f7c6c6] hover:bg-[#fdeaea]"
                        >
                          Remove
                        </button>
                      </div>

                      {/* What it is called, and what it is scanned by — the
                          same pairing the form uses for Unit and SKU above. */}
                      <div className="flex flex-col gap-[20px] sm:flex-row sm:items-start">
                        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                          <label htmlFor={`${row.key}-name`} className={SUBLABEL}>
                            Variant name <span className="text-[#c62828]">*</span>
                          </label>
                          <div className={FIELD}>
                            <input
                              id={`${row.key}-name`}
                              value={row.name}
                              onChange={(e) => patchVariant(row.key, { name: e.target.value })}
                              aria-label={`Variant ${index + 1} name`}
                              placeholder="500ml"
                              className={INPUT}
                            />
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                          <label htmlFor={`${row.key}-sku`} className={SUBLABEL}>
                            SKU <span className="text-[#8f8d87]">(optional)</span>
                          </label>
                          <div className={FIELD}>
                            <input
                              id={`${row.key}-sku`}
                              value={row.sku}
                              onChange={(e) => patchVariant(row.key, { sku: e.target.value })}
                              aria-label={`Variant ${index + 1} SKU`}
                              placeholder="Left blank, the API makes one"
                              className={INPUT}
                            />
                          </div>
                        </div>
                        {/* Its OWN code. A 250ml bottle and a 1L bottle carry
                            different numbers, and scanning one rather than the
                            other is the point. Left empty, the server assigns
                            an internal code so every size stays scannable. */}
                        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                          <label htmlFor={`${row.key}-barcode`} className={SUBLABEL}>
                            Barcode <span className="text-[#8f8d87]">(optional)</span>
                          </label>
                          <div className={FIELD}>
                            <input
                              id={`${row.key}-barcode`}
                              value={row.barcode}
                              onChange={(e) =>
                                patchVariant(row.key, { barcode: e.target.value.trim() })
                              }
                              aria-label={`Variant ${index + 1} barcode`}
                              placeholder="Scan or type"
                              className={INPUT}
                            />
                          </div>
                        </div>
                      </div>

                      {/* The money and the shelf, in the order the form asks
                          them of the product above: paid, charged, counted. */}
                      <div className="flex flex-col gap-[20px] sm:flex-row sm:items-start">
                        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                          <label htmlFor={`${row.key}-cost`} className={SUBLABEL}>
                            Purchase Price
                          </label>
                          <div className={FIELD}>
                            <input
                              id={`${row.key}-cost`}
                              value={row.purchasePrice}
                              onChange={(e) =>
                                patchVariant(row.key, {
                                  purchasePrice: e.target.value.replace(/[^\d.]/g, ""),
                                })
                              }
                              inputMode="decimal"
                              aria-label={`Variant ${index + 1} purchase price`}
                              placeholder="৳ 0.00"
                              className={INPUT}
                            />
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                          <label htmlFor={`${row.key}-price`} className={SUBLABEL}>
                            Selling Price <span className="text-[#c62828]">*</span>
                          </label>
                          <div className={FIELD}>
                            <input
                              id={`${row.key}-price`}
                              value={row.sellingPrice}
                              onChange={(e) =>
                                patchVariant(row.key, {
                                  sellingPrice: e.target.value.replace(/[^\d.]/g, ""),
                                })
                              }
                              inputMode="decimal"
                              aria-label={`Variant ${index + 1} selling price`}
                              placeholder="৳ 0.00"
                              className={INPUT}
                            />
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                          <label htmlFor={`${row.key}-opening`} className={SUBLABEL}>
                            Opening Stock <span className="text-[#8f8d87]">(optional)</span>
                          </label>
                          <div className={FIELD}>
                            <input
                              id={`${row.key}-opening`}
                              value={row.openingStock}
                              onChange={(e) =>
                                patchVariant(row.key, {
                                  openingStock: e.target.value.replace(/[^\d.]/g, ""),
                                })
                              }
                              inputMode="decimal"
                              aria-label={`Variant ${index + 1} opening stock`}
                              placeholder="0"
                              className={INPUT}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                hint={
                  hasVariants
                    ? `The till's offer, applied to all ${variants.length} variants.`
                    : "The till's offer on this product."
                }
              />
              {/* SELLING VAT, said plainly.
                  It was labelled "Tax / VAT" beside a Purchase Price box, so it
                  read as the VAT the shop PAYS its supplier — and it is not:
                  this rate is what the till charges the customer. The VAT on a
                  delivery belongs on the purchase, where it posts to VAT
                  Receivable and is recoverable; this one is output tax and
                  belongs to the customer's receipt. The two are different
                  money and naming them the same thing is what confused it. */}
              <RateField
                id="p-tax"
                label="Selling VAT"
                value={form.tax}
                mode={rates.tax}
                onValue={(v) => set("tax", v)}
                onMode={(m) => setRates((r) => ({ ...r, tax: m }))}
                hint={
                  rates.tax === "percent"
                    ? "Charged to the customer at the till. VAT you pay a supplier goes on the purchase."
                    : "A flat tax is priced here only — the API stores a percentage."
                }
              />
            </div>

            {/* Derived, so read-only — 57:12823.

                Absent once the product has variants: it is computed from the
                single Selling Price box, and that box is gone. Showing one
                "Final Price" for a product sold at three prices would be a
                figure that is wrong for at least two of them. The discount and
                VAT above still apply to all of them — see the save. */}
            {!hasVariants && (
              <div className="flex flex-col gap-[8px]">
                <span className={LABEL}>Final Price</span>
                <div className={FIELD}>
                  <output aria-label="Final price" className="min-w-px flex-1 text-[16px] leading-[24px] text-[#525252]">
                    ৳ {finalPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </output>
                </div>
              </div>
            )}

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
