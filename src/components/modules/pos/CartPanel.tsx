"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CartItem, CheckoutPayload, Customer, HeldCart, ProductItem } from "@/types/pos";
import { CustomerService, PosService, SettingsService } from "@/services";
import { useSession } from "@/services/useSession";
import { useQuery, useMutation, queryKey, invalidate } from "@/lib/query/useQuery";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import Receipt from "@/components/shared/Receipt";
import ProductImage from "@/components/shared/ProductImage";
import { useProductDiscounts } from "@/lib/usePosDiscounts";
import { amountOff } from "@/services/discountService";
import { usePosDraft, patchPosDraft } from "@/components/modules/pos/posCart";

/**
 * Figma: SortPi — POS invoice column 45:2333.
 *
 * 565-wide column, 958 tall in the frame: the invoice header, cart table and
 * customer summary sit at the top, the order summary and pay buttons at the
 * bottom (45:2334 / 45:2480 are 173px apart in the frame, i.e. justified).
 */

const money = (n: number) => `৳${n.toLocaleString("en-IN")}`;

/** eva:arrow-ios-downward-outline — node 45:2466. */
function CaretDown() {
  return (
    <svg className="block size-[24px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16C11.7663 16.0005 11.5399 15.9191 11.36 15.77L5.36 10.77C5.15578 10.6003 5.02736 10.3564 5.00298 10.0919C4.9786 9.8275 5.06026 9.56422 5.23 9.36C5.39974 9.15578 5.64365 9.02736 5.90808 9.00298C6.1725 8.9786 6.43578 9.06026 6.64 9.23L12 13.71L17.36 9.39C17.4623 9.30693 17.58 9.2449 17.7063 9.20747C17.8327 9.17004 17.9652 9.15795 18.0962 9.17188C18.2272 9.18582 18.3542 9.22552 18.4698 9.28873C18.5854 9.35194 18.6874 9.43738 18.77 9.54C18.8531 9.64229 18.9151 9.75999 18.9525 9.88634C18.99 10.0127 19.002 10.1452 18.9881 10.2762C18.9742 10.4072 18.9345 10.5342 18.8713 10.6498C18.8081 10.7654 18.7226 10.8674 18.62 10.95L12.62 15.78C12.4408 15.9159 12.2242 15.9931 12 16Z"
        fill="currentColor"
      />
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

/** Node 45:2996 — add customer. */
function AddCustomerIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M13.33 0.63v3.33c0 .71.28 1.38.78 1.88s1.17.78 1.88.78h3.99c0 .07.01.14.01.21v8.47c0 2.94-2.39 5.33-5.33 5.33H5.33C2.39 20.63 0 18.24 0 15.3V6c0-2.94 2.39-5.33 5.33-5.33h8Z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M10 6.5v7M6.5 10h7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="0.8" y="0.8" width="18.4" height="18.4" rx="5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PercentIcon() {
  return (
    <svg className="block size-[24px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 15L15 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9.3" cy="9.3" r="1.3" fill="currentColor" />
      <circle cx="14.7" cy="14.7" r="1.3" fill="currentColor" />
    </svg>
  );
}

function CouponIcon() {
  return (
    <svg className="block size-[24px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 8.2A2.2 2.2 0 0 1 5.2 6h13.6A2.2 2.2 0 0 1 21 8.2v1.4a2.4 2.4 0 0 0 0 4.8v1.4a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 15.8v-1.4a2.4 2.4 0 0 0 0-4.8V8.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 10.5l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="block h-[24px] w-[21.77px] shrink-0" viewBox="0 0 22 24" fill="none" aria-hidden>
      <path
        d="M2.6 6.4h16.6l-1.2 14.1a2.6 2.6 0 0 1-2.6 2.4H6.4a2.6 2.6 0 0 1-2.6-2.4L2.6 6.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M1 6.4h20M8 3h6M8.6 10.6v7.6M13.2 10.6v7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Node 45:2406 / 45:2412 — the 44x30 stepper ends. */
function Stepper({
  value,
  onDec,
  onInc,
  atCap = false,
  stock,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  /** The shelf cannot cover another one. */
  atCap?: boolean;
  stock?: number;
}) {
  const end =
    "flex h-[30px] w-[44px] shrink-0 cursor-pointer flex-col items-center justify-center border-[0.4px] border-solid border-[#525252] px-[8px] py-[4px] text-[#525252] transition-colors hover:bg-[#fafafa]";
  return (
    <div className="flex h-[30px] items-center rounded-[6px]">
      <button type="button" aria-label="Decrease quantity" onClick={onDec} className={`${end} rounded-l-[4px]`}>
        <svg className="block size-[16px]" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <span className="flex h-[30px] w-[44px] shrink-0 flex-col items-center justify-center border-y-[0.4px] border-solid border-[#525252] px-[8px] py-[4px] text-center text-[12px] leading-[16px] font-medium text-[#525252]">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={onInc}
        disabled={atCap}
        title={atCap ? `Only ${stock} in stock` : undefined}
        className={`${end} rounded-r-[4px] ${
          atCap ? "cursor-not-allowed text-[#d4d4d4] hover:bg-white" : ""
        }`}
      >
        <svg className="block size-[16px]" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

const FIELD =
  "flex h-[44px] items-center gap-[6px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea]";
const GHOST_BTN =
  "flex cursor-pointer items-center justify-center rounded-[4px] border border-solid border-[rgba(30,30,30,0.5)] px-[17px] py-[4px] text-[16px] leading-[1.5] tracking-[-0.32px] text-[rgba(30,30,30,0.5)] transition-colors hover:bg-[#fafafa]";

interface CartPanelProps {
  cart: CartItem[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  /** False in the three-column view, where the middle column lists the items. */
  showItems?: boolean;
  /** Puts a whole cart back, which Hold/Start needs. */
  onRestoreCart: (items: CartItem[]) => void;
}

export default function CartPanel({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  showItems = true,
  onRestoreCart,
}: CartPanelProps) {
  const session = useSession();

  // Everything the till reads from the server goes through the shared cache,
  // so a customer added on the Customers screen shows up in this dropdown
  // without the cashier reloading the till.
  const { data: customerRows } = useQuery(queryKey("pos-customers"), () =>
    PosService.getCustomers()
  );
  const customers = useMemo(() => customerRows ?? [], [customerRows]);

  const { data: shopValues } = useQuery(
    queryKey("settings", { scope: "values" }),
    () => SettingsService.getValues(),
    // Tax rate and the discount ceiling change about once a year. Re-asking
    // every 30s on a screen that is open all day is pure noise.
    { staleMs: 5 * 60_000 }
  );

  const { data: companyProfile } = useQuery(
    queryKey("settings", { scope: "company-profile" }),
    () => SettingsService.getCompanyProfile(),
    { staleMs: 5 * 60_000 }
  );

  // Parked carts belong to the sale flow, so a completed or resumed sale
  // invalidating "sales" refreshes this list too.
  const { data: heldRows } = useQuery(
    queryKey("sales", { pos: "held-carts" }),
    () => PosService.heldCarts(),
    { staleMs: 10_000 }
  );
  const held = useMemo(() => heldRows ?? [], [heldRows]);

  // Who the invoice is for and what comes off it belong to the sale, not to
  // this panel: they are kept beside the cart lines so that stepping over to
  // another screen mid-sale leaves the whole invoice standing. See posCart.ts.
  const sale = usePosDraft();
  const pickedCustomer = sale.customer;
  const setCustomer = (next: Customer | null) => patchPosDraft({ customer: next });
  const discount = sale.discount;
  const setDiscount = (next: string) => patchPosDraft({ discount: next });
  const discountMode = sale.discountMode;
  const setDiscountMode = (next: "percent" | "flat") => patchPosDraft({ discountMode: next });

  const [customerQuery, setCustomerQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  // How this shop charges VAT, and how much may come off a bill. Both are set
  // once in Settings; the till only reads them.
  const shop = useMemo(() => {
    const rate = Number(shopValues?.["tax.default_rate"]);
    const cap = Number(shopValues?.["pos.max_discount_percent"]);
    return {
      vatRate: Number.isFinite(rate) ? rate : 0.15,
      vatIncluded: String(shopValues?.["tax.inclusive_by_default"] ?? "true") !== "false",
      maxDiscount: Number.isFinite(cap) && cap > 0 ? cap : 1,
    };
  }, [shopValues]);

  const onlineMethods = useMemo(() => {
    const raw = shopValues?.["pos.online_payment_methods"];
    if (typeof raw === "string" && raw.trim()) {
      const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        if (!list.some((x) => x.toLowerCase() === "others" || x.toLowerCase() === "other")) {
          if (raw.trim() === "Card, bKash, Nagad, Rocket, Bank Transfer") {
            return [...list, "Others"];
          }
        }
        return list;
      }
    }
    return ["Card", "bKash", "Nagad", "Rocket", "Bank Transfer", "Others"];
  }, [shopValues]);
  // Empty means "the shop's usual rate". A figure here is this sale only.
  /**
   * The VAT override for this sale. `null` means "whatever the shop is set to";
   * a string — INCLUDING the empty one — means the cashier has taken it over.
   *
   * It used to be a plain string with `""` standing for "use the shop rate",
   * which made a zero-rated sale impossible to ring: clearing the box put the
   * shop's 8% straight back into it on the next render, so there was no way to
   * express "no VAT on this one" short of typing a zero. Empty now means zero,
   * and the reset link below is what restores the shop rate.
   */
  const vat = sale.vat;
  const setVat = (next: string | null) => patchPosDraft({ vat: next });
  // Whose shop this is. The receipt is headed by the customer's company, not
  // by the software that printed it.
  const shopProfile = useMemo(
    () => ({
      name: companyProfile?.companyName || "",
      tagline: companyProfile?.businessType || "",
      address: companyProfile?.address || "",
      bin: companyProfile?.taxId || companyProfile?.tradeLicenseBin || "",
      phone: companyProfile?.phoneNumber || "",
    }),
    [companyProfile]
  );
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<{ name: string; phone: string; type: "Regular" | "VIP" | "Premium" }>({
    name: "",
    phone: "",
    type: "Regular",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  // The invoice defaults to the first customer on file until the cashier picks
  // one. Derived rather than copied into state in an effect: on a cache hit
  // there is no fetch to hang the default off, and an effect that assigns it
  // costs a second render on every mount of the till.
  const customer = pickedCustomer ?? customers[0] ?? null;

  useEffect(() => {
    if (!selectOpen && !listOpen) return;
    const onDown = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setSelectOpen(false);
        setListOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selectOpen, listOpen]);

  useEffect(() => {
    if (!addOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAddOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addOpen]);

  // A customer rung up at the till is the same record the back office lists,
  // and their spend moves the dashboard's figures.
  const { mutate: addCustomer } = useMutation(
    (payload: { name: string; phone: string; type: "Regular" | "VIP" | "Premium" }) =>
      CustomerService.createCustomer(payload),
    { invalidates: ["pos-customers", "customers", "dashboard"] }
  );

  /** Creates the customer, then selects them on this invoice. */
  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const name = draft.name.trim();
    const phone = draft.phone.trim();
    if (!name) return setFormError("Name is required.");
    if (!phone) return setFormError("Phone is required.");
    setFormError(null);
    setSaving(true);
    try {
      const created = await addCustomer({ name, phone, type: draft.type });
      const next: Customer = {
        id: created.id,
        name: created.name,
        phone: created.phone,
        type: draft.type,
      };
      setCustomer(next);
      setAddOpen(false);
      setDraft({ name: "", phone: "", type: "Regular" });
      setStatus(`${next.name} added and selected`);
    } catch {
      setFormError("Could not save the customer. Try again.");
    } finally {
      setSaving(false);
    }
  };

  /** Park the current cart on the server, then clear the till. */
  const parkCart = async () => {
    if (!cart.length || busy) return;
    setBusy(true);
    try {
      await PosService.holdCart(
        cart.map((i) => ({
          productId: i.product.id,
          name: i.product.name,
          sku: i.product.sku,
          price: i.product.price,
          stock: i.product.stock,
          quantity: i.quantity,
        })),
        customer?.id || undefined
      );
      onClearCart();
      // Parking moves a cart off this till and onto the branch's parked list,
      // which every other till reads through the same key.
      invalidate("sales");
      setStatus("Cart parked. Take it back with Start.");
    } catch {
      setStatus("Could not park this cart.");
    } finally {
      setBusy(false);
    }
  };

  /** Take a parked cart back to the till. The server hands it over once. */
  const resumeCart = async (row: HeldCart) => {
    setBusy(true);
    try {
      const items = await PosService.resumeCart(row.id);
      onRestoreCart(
        items.map((i) => ({
          product: {
            id: i.productId,
            name: i.name,
            sku: i.sku,
            price: i.price,
            priceFormatted: money(i.price),
            stock: i.stock ?? i.quantity,
            category: "Groceries",
            image: "",
          } as ProductItem,
          quantity: i.quantity,
        }))
      );
      setHeldOpen(false);
      invalidate("sales");
      setStatus(`${row.reference} resumed`);
    } catch {
      setStatus("Could not take that cart back.");
    } finally {
      setBusy(false);
    }
  };

  // Changing what a customer is taxed is its own permission, the same as it
  // is on the server: a cashier sees the rate, a supervisor can change it.
  const mayChangeVat = (session.user?.permissions ?? []).includes("pos.price_override");

  /** The branch's product offers — the same map the wall prices its tiles by. */
  const rates = useProductDiscounts();

  /** The rate this sale is taxed at: what was typed, or the shop's own. */
  // `Number("")` is 0, which is exactly what an emptied box should mean here.
  const vatRate = vat === null ? shop.vatRate : Math.max(0, Number(vat) || 0) / 100;

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
    // The per-product offers the Discounts screen set, on the lines that are
    // actually in this cart. Without this the wall showed a reduced price and
    // the till charged the shelf price — the offer existed on one screen only.
    const offersOff = cart.reduce(
      (s, i) => s + amountOff(i.product.price, rates[i.product.id]) * i.quantity,
      0
    );
    /**
     * How ONE line is taxed, resolved the way the server resolves it.
     *
     * Every line used to be taxed at the shop's default rate, because the
     * product payload carried only a tax id. The server taxes each line at the
     * PRODUCT's own rate and inclusivity and only falls back to the shop's
     * where a product has none — so a product with its own rate was quoted at
     * one figure here and booked at another. The server now sends both
     * resolved values with each product and this reads them.
     *
     * A rate typed into the VAT box overrides the rate for every line, which
     * is what `tax_rate` on the request body does on the server; it does NOT
     * override inclusivity, because whether a shelf price contains tax is a
     * bookkeeping rule and not a per-sale decision.
     */
    const lineTax = (item: CartItem) => ({
      rate: vat !== null ? vatRate : item.product.taxRate ?? shop.vatRate,
      inclusive: item.product.taxInclusive ?? shop.vatIncluded,
    });
    // No delivery charge on a till sale. It used to add a flat 60 the server
    // has no field for, so the tender came to more than the bill and the sale
    // was refused with PAYMENT_EXCEEDS_TOTAL.
    const shipping = 0;
    const entered = Math.max(0, Number(discount) || 0);
    // Percentage caps at 100; a flat amount can never exceed the subtotal.
    const manualOff =
      discountMode === "percent" ? (subtotal * Math.min(100, entered)) / 100 : Math.min(subtotal, entered);
    // There is no coupon endpoint: nothing on the server issues, validates or
    // redeems a code. The rule that used to live here gave a real 10% away for
    // the literal string "SAVE10", client-side, and sent the reduced figure on
    // to the sale — money off with no authority behind it. Until a coupon
    // resource exists the field below stays disabled and takes nothing off.
    /**
     * The shop's ceiling on what a TILL may give away, from Settings.
     *
     * It bounds the manual discount alone. A shop offer is the shop's own
     * decision about what a product sells for this week — it is not a cashier
     * giving money away at the counter, and holding it to the cashier's limit
     * would mean a 30% promotion could not be run through a till whose limit is
     * 20%. The server enforces the same split.
     */
    const ceiling = subtotal * shop.maxDiscount;
    const manualCapped = Math.min(manualOff, ceiling);
    const off = Math.round(Math.min(subtotal, offersOff + manualCapped));

    /**
     * Tax, per LINE, on that line's post-discount share.
     *
     * Two ways to charge VAT and they are not interchangeable. Bangladeshi
     * shelf prices normally include it, so it is taken OUT of the price rather
     * than added: the customer pays the same either way and only the books
     * differ. Both live in one cart when products carry different taxes, which
     * is why this is summed per line rather than applied to the total.
     *
     * The discount is spread across the lines in proportion to what each is
     * worth, which is what `PricingEngine.allocate` does on the server. A
     * single-rate cart comes out identical to the old whole-cart arithmetic.
     */
    const gross = subtotal || 1;
    let tax = 0;
    let total = 0;
    let inclusiveTax = 0;
    let addedTax = 0;
    for (const item of cart) {
      const lineGross = item.product.price * item.quantity;
      const lineTaxable = Math.max(0, lineGross - (off * lineGross) / gross);
      const { rate, inclusive } = lineTax(item);
      if (inclusive) {
        const t = lineTaxable - lineTaxable / (1 + rate);
        tax += t;
        inclusiveTax += t;
        total += lineTaxable;
      } else {
        const t = lineTaxable * rate;
        tax += t;
        addedTax += t;
        total += lineTaxable + t;
      }
    }

    return {
      subtotal,
      shipping,
      discount: off,
      offersOff: Math.round(Math.min(subtotal, offersOff)),
      // What the till may still send as an invoice discount. The OFFERS are no
      // longer sent — the server holds them and applies each to its own line —
      // so sending them here as well would take them off twice.
      manualDiscount: Math.round(manualCapped),
      tax,
      // Split out so the summary can say which half is in the price and which
      // is added on top. A cart can hold both.
      inclusiveTax,
      addedTax,
      total,
      capped: manualOff > ceiling,
    };
  }, [cart, discount, discountMode, shop, vat, vatRate, rates]);

  /**
   * Name OR phone. A cashier facing a returning customer has their number far
   * more often than the spelling of their name, and matching only the name
   * meant the number on the loyalty card was useless at the till.
   *
   * Digits are compared with the punctuation stripped from BOTH sides: numbers
   * are stored as `01810000002` but people read them aloud and type them as
   * `018 1000 0002` or `+880 1810-000002`, and none of those matched the
   * stored string. A trailing fragment counts too, so the last four digits —
   * the part anyone actually remembers — finds the row.
   */
  const matches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return [];
    const qDigits = q.replace(/\D/g, "");
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (!qDigits) return false;
      const phoneDigits = (c.phone ?? "").replace(/\D/g, "");
      return phoneDigits !== "" && phoneDigits.includes(qDigits);
    });
  }, [customers, customerQuery]);

  // What the confirmation modal shows. Held separately from `cart`, which is
  // cleared the moment the sale succeeds.
  const [receipt, setReceipt] = useState<{
    invoiceNo: string;
    method: string;
    items: number;
    units: number;
    subtotal: number;
    shipping: number;
    discount: number;
    tax: number;
    total: number;
    customer: string;
    at: string;
    lines: { name: string; price: string; qty: number; total: string }[];
    referenceNo?: string;
  } | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [onlineModalOpen, setOnlineModalOpen] = useState(false);
  const [selectedOnlineMethod, setSelectedOnlineMethod] = useState<string>("Card");
  const [referenceNo, setReferenceNo] = useState("");

  /**
   * The key this cart is rung up under.
   *
   * The server guarantees at-most-once execution per `Idempotency-Key`, and
   * that guarantee is only worth anything if the key STAYS THE SAME across
   * attempts. A key minted per request — which is what this used to send —
   * turns a double-tap on PAY, or a cashier retrying after a timeout, into two
   * invoices, two stock movements and two rows in the drawer.
   *
   * It must also CHANGE when the basket does. The server answers 409 to the
   * same key carrying a different body, deliberately: that is a real second
   * sale, not a replay. So the key is tied to a signature of what is being
   * sent — edit a line and the next attempt is a new sale; press PAY twice on
   * the same basket and the second is a replay of the first.
   *
   * The nonce keeps two identical baskets apart: a customer buying the same
   * thing twice in a row is two sales, and a signature alone cannot tell that
   * from a double-tap.
   */
  const checkoutKey = useRef<{ signature: string; key: string } | null>(null);

  /** One key per (basket, nonce). Same basket, same key; edited basket, new one. */
  const keyForSignature = (signature: string): string => {
    if (checkoutKey.current?.signature === signature) return checkoutKey.current.key;
    const key = `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    checkoutKey.current = { signature, key };
    return key;
  };

  /**
   * A latch, not the `busy` flag.
   *
   * `busy` is React state: two clicks landing in one tick both read `false`
   * and both call through. A ref is written synchronously, so the second one
   * sees the first.
   */
  const paying = useRef(false);

  const pay = async (method: string = paymentMethod, refNo?: string) => {
    if (!cart.length || paying.current || busy) return;
    paying.current = true;
    // Everything the request body is built from. Two attempts that would post
    // the same body share a key; anything else gets its own.
    const signature = JSON.stringify([
      cart.map((i) => [i.product.id, i.quantity, i.product.price]),
      customer?.id ?? "walk-in",
      totals.manualDiscount,
      vat,
      method,
      refNo ?? referenceNo ?? "",
      totals.total,
    ]);
    setBusy(true);
    setStatus(null);
    try {
      const res = await PosService.checkout({
        idempotencyKey: keyForSignature(signature),
        customerId: customer?.id ?? "walk-in",
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.product.price,
        })),
        paymentMethod: method,
        ...(refNo ? { referenceNo: refNo } : {}),
        /**
         * The MANUAL discount only.
         *
         * Shop offers used to be lumped in here, because the server could not
         * see them — and the pricing engine spreads an invoice discount across
         * every line, so a full-price product carried part of another product's
         * offer. The server now holds the offers and applies each to its own
         * line, so sending them again would take them off twice: once by the
         * server and once by this figure.
         */
        discountAmount: totals.manualDiscount,
        // Only when it was changed here. The shop's own rate needs no saying,
        // and sending it would need a permission a cashier does not hold.
        ...(vat !== null ? { taxRate: vatRate } : {}),
        // What the shopper hands over: the bill after the discount, which is
        // what the server will have priced it at.
        totalAmount: totals.total,
      });
      /**
       * The RECORDED sale, not this screen's arithmetic.
       *
       * The server prices every line itself and works the totals out from them,
       * and where it disagrees with the till the till pays the server's figure —
       * `checkout` retries with `grand_total` when a tender is refused for
       * exceeding it. The receipt was still printed from `totals`, so the
       * customer could be handed a slip whose subtotal, discount and total were
       * not the ones in the books, and the difference only ever surfaced at a
       * reconciliation weeks later.
       *
       * The till's own figures remain the fallback for a response that carries
       * none — a receipt with approximately the right numbers beats no receipt
       * at all with a customer waiting.
       */
      const booked = res?.totals;
      setReceipt({
        invoiceNo: res?.invoiceNo ?? `INV-${Date.now().toString().slice(-8)}`,
        method: method,
        items: cart.length,
        units: cart.reduce((n, i) => n + i.quantity, 0),
        subtotal: booked?.subtotal ?? totals.subtotal,
        shipping: totals.shipping,
        discount: booked?.discount ?? totals.discount,
        tax: Math.round(booked?.tax ?? totals.tax),
        total: booked?.grandTotal ?? totals.total,
        lines: cart.map((i) => ({
          name: i.product.name,
          price: i.product.price.toLocaleString("en-IN"),
          qty: i.quantity,
          total: (i.product.price * i.quantity).toLocaleString("en-IN"),
        })),
        customer: customer?.name ?? "Walk-in Customer",
        at: new Intl.DateTimeFormat("en-GB", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }).format(new Date()),
        referenceNo: refNo || referenceNo || "",
      });
      setStatus(null);
      // A sale moves all of these at once: the sales ledger, the stock on the
      // shelf, the inventory valuation, the day's figures, and the stock badge
      // on every tile of the product wall behind this panel.
      invalidate("sales", "stock", "inventory", "dashboard", "pos-products");
      // This cart is booked. The next one is a new sale and needs a new key —
      // reusing this one would make the server replay the sale just made and
      // hand back its receipt instead of ringing the new basket.
      checkoutKey.current = null;

      onClearCart();
      setDiscount("");
      setVat(null);
      setReferenceNo("");
    } catch (err) {
      /**
       * The server's own sentence, not "try again".
       *
       * "Try again" was advice that could not work: every refusal here is
       * deterministic — no stock, a shift that closed, a price the till
       * disagrees with — so pressing the button a second time fails
       * identically. Naming the reason is the only thing that lets a cashier
       * act on it.
       */
      setStatus(
        err instanceof Error && err.message ? err.message : "Payment failed. Try again."
      );
    } finally {
      paying.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-full w-full flex-col gap-[32px]">
      <div className="flex flex-col gap-[36px]">
        {/* Invoice header — 45:2336 */}
        <div className="flex flex-col gap-[44px]">
          <div className="flex min-h-[32px] flex-wrap items-center justify-between gap-[12px]">
            <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] whitespace-nowrap text-[#1e1e1e]">
              Invoice on payment
            </p>
            <div className="flex items-center gap-[12px]">
              <button
                type="button"
                disabled={!cart.length || busy}
                onClick={parkCart}
                title="Park this cart and clear the till"
                className={GHOST_BTN}
              >
                Hold
              </button>
              <button
                type="button"
                onClick={() => {
                  invalidate("sales");
                  setHeldOpen(true);
                }}
                title="Take back a parked cart"
                className={GHOST_BTN}
              >
                Start
                {held.length > 0 && (
                  <span className="ml-[6px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#fdf7e6] px-[5px] text-[11px] font-semibold text-[#f5b800] tabular-nums">
                    {held.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  setDiscount("");
                  setVat(null);
                  setStatus("Invoice reset");
                }}
                title="Empty the till and start again"
                className={GHOST_BTN}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Cart table — 45:2346. Hidden in the three-column view, where the
              middle column holds it instead. */}
          {showItems && (
          <div className="w-full overflow-hidden rounded-[10px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
            <div className="flex items-center justify-between px-[16px] pt-[16px] pb-[8px]">
              <p className="text-[16px] leading-[1.5] tracking-[-0.32px] whitespace-nowrap text-[#1e1e1e]">
                <span className="font-medium">Cart </span>
                <span className="font-normal">({cart.length} items)</span>
              </p>
              <button
                type="button"
                aria-label="Clear cart"
                onClick={onClearCart}
                className="cursor-pointer text-[#ef4444] transition-opacity hover:opacity-70"
              >
                <TrashIcon />
              </button>
            </div>

            <div className="px-[16px] pb-[16px]">
              <div className="overflow-x-auto">
                <div className="min-w-[420px]">
                  <div className="flex items-start">
                    <div className="flex h-[40px] w-[48px] shrink-0 items-center p-[12px]">
                      <span className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">#</span>
                    </div>
                    <div className="flex h-[40px] min-w-px flex-1 items-center p-[12px]">
                      <span className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">
                        Reference
                      </span>
                    </div>
                    <div className="flex h-[40px] w-[90px] shrink-0 items-center p-[12px]">
                      <span className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">
                        Price
                      </span>
                    </div>
                    <div className="flex h-[40px] w-[150px] shrink-0 items-center justify-center p-[12px]">
                      <span className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">Qty</span>
                    </div>
                  </div>

                  <div className="no-scrollbar mt-[6px] max-h-[216px] overflow-y-auto">
                    {cart.length === 0 && (
                      <p className="py-[28px] text-center text-[14px] text-[#525252]">Cart is empty.</p>
                    )}
                    {cart.map((item, i) => (
                      <div
                        key={item.product.id}
                        className="flex h-[54px] items-center border-b border-solid border-[#eaeaea] last:border-b-0"
                      >
                        <div className="flex w-[48px] shrink-0 items-center p-[12px]">
                          <span className="text-[14px] leading-[1.5] font-normal text-[#525252]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <div className="flex min-w-px flex-1 items-center gap-[6px] px-[10px]">
                          <span className="relative size-[24px] shrink-0 overflow-hidden rounded-[4px]">
                            <ProductImage src={item.product.image} alt="" sizes="24px" />
                          </span>
                          <span className="truncate text-[14px] leading-[24px] font-normal text-[#525252]">
                            {item.product.name}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${item.product.name}`}
                            onClick={() => onRemoveItem(item.product.id)}
                            className="ml-auto cursor-pointer px-[4px] text-[16px] leading-none text-[#a3a3a3] transition-colors hover:text-[#ef4444]"
                          >
                            ×
                          </button>
                        </div>
                        <div className="flex w-[90px] shrink-0 items-center p-[12px]">
                          {(() => {
                            const off = amountOff(item.product.price, rates[item.product.id]);
                            return (
                              <span className="flex flex-col text-[14px] leading-[1.5] font-normal whitespace-nowrap text-[#525252]">
                                {money(item.product.price - off)}
                                {off > 0 && (
                                  <span className="text-[11px] leading-[14px] text-[#a3a3a3] line-through">
                                    {money(item.product.price)}
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex w-[150px] shrink-0 items-center justify-center p-[12px]">
                          <Stepper
                            value={item.quantity}
                            onDec={() => onUpdateQuantity(item.product.id, -1)}
                            onInc={() => onUpdateQuantity(item.product.id, 1)}
                            atCap={item.product.stock > 0 && item.quantity >= item.product.stock}
                            stock={item.product.stock}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Customer summary — 45:2450 */}
        <div className="flex flex-col gap-[36px]">
          <div className="flex flex-col gap-[12px]" ref={selectRef}>
            <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] text-[#1e1e1e]">
              Customer Summary
            </p>

            <div className="relative">
              <div className={`${FIELD} justify-between`}>
                <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
                  <SearchIcon />
                  <input
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setListOpen(true);
                    }}
                    onFocus={() => setListOpen(true)}
                    placeholder="Search by name or phone..."
                    aria-label="Search customers"
                    className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Add customer"
                  onClick={() => {
                    setFormError(null);
                    setAddOpen(true);
                  }}
                  className="shrink-0 cursor-pointer text-[#1e1e1e] transition-opacity hover:opacity-70"
                >
                  <AddCustomerIcon />
                </button>
              </div>
              {listOpen && customerQuery.trim() !== "" && (
                <div className="absolute top-[48px] right-0 left-0 z-30 max-h-[190px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                  {matches.length === 0 && (
                    <p className="px-[14px] py-[10px] text-[13px] text-[#525252]">No customer found.</p>
                  )}
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomer(c);
                        setCustomerQuery("");
                        setListOpen(false);
                      }}
                      className="block w-full cursor-pointer px-[14px] py-[8px] text-left text-[13px] text-[#525252] transition-colors hover:bg-[#fafafa]"
                    >
                      {c.name}
                      <span className="text-[#a3a3a3]"> · {c.phone || "no phone"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectOpen((v) => !v)}
                aria-expanded={selectOpen}
                className={`${FIELD} w-full cursor-pointer justify-between`}
              >
                <span className="flex min-w-0 flex-col items-start">
                  <span className="truncate text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252]">
                    {customer?.name ?? "Walk-in Customer"}
                  </span>
                  <span className="truncate text-[12px] leading-[1.4] text-[#8f8d87]">
                    {customer ? customer.phone || "no phone on file" : "no customer chosen"}
                  </span>
                </span>
                <span className="text-[#525252]">
                  <CaretDown />
                </span>
              </button>
              {selectOpen && (
                <div className="absolute top-[48px] right-0 left-0 z-30 max-h-[190px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomer(c);
                        setSelectOpen(false);
                      }}
                      className={`block w-full cursor-pointer px-[14px] py-[8px] text-left text-[13px] transition-colors hover:bg-[#fafafa] ${
                        customer?.id === c.id ? "font-medium text-[#f5b800]" : "text-[#525252]"
                      }`}
                    >
                      {c.name}
                      <span className="text-[#a3a3a3]"> · {c.phone || "no phone"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Discount and coupon.
                Side by side in the two-column till, stacked in the three-column
                one. The decision cannot be a viewport breakpoint: what changes
                is the width of THIS COLUMN, which is ~360px in the three-column
                layout and twice that in the two-column one, at any window size.
                `showItems` is false exactly when this panel is the narrow
                invoice column, so it is the honest signal.

                Side by side there left each field under 170px with a mode
                toggle inside it, and the word "Discount" rendered as "Disco". */}
            <div
              className={
                showItems
                  ? "flex flex-col gap-[21px] sm:flex-row sm:items-center"
                  : "flex flex-col gap-[12px]"
              }
            >
              <div className={`${FIELD} min-w-0 flex-1`}>
                <span className="text-[rgba(82,82,82,0.6)]">
                  <PercentIcon />
                </span>
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  placeholder="Discount"
                  aria-label="Discount amount"
                  className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
                {/* Percentage of the subtotal, or a flat amount off it. */}
                <span className="flex shrink-0 items-center gap-[2px] rounded-[8px] bg-[#f5f5f5] p-[2px]">
                  {(["percent", "flat"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDiscountMode(m)}
                      aria-pressed={discountMode === m}
                      aria-label={m === "percent" ? "Discount as percentage" : "Discount as flat amount"}
                      className={`flex h-[22px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] text-[12px] font-medium transition-colors ${
                        discountMode === m ? "bg-white text-[#f5b800] shadow-[0_1px_2px_rgba(82,88,102,0.08)]" : "text-[#525252]"
                      }`}
                    >
                      {m === "percent" ? "%" : "৳"}
                    </button>
                  ))}
                </span>
              </div>
              {/* Disabled rather than removed: the field is in the design and
                  will work the day there is a coupon resource to check a code
                  against. Live, it would only ever be a discount nobody
                  authorised. */}
              <div className={`${FIELD} min-w-0 flex-1 opacity-60`} title="Coupons are not available yet">
                <span className="text-[rgba(82,82,82,0.6)]">
                  <CouponIcon />
                </span>
                <input
                  value=""
                  readOnly
                  disabled
                  placeholder="Coupon Code"
                  aria-label="Coupon code — not available yet"
                  aria-describedby="coupon-unavailable"
                  className="min-w-0 flex-1 cursor-not-allowed bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
                <span
                  id="coupon-unavailable"
                  className="shrink-0 text-[11px] whitespace-nowrap text-[#8f8d87]"
                >
                  Not available yet
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order summary — 45:2480. Sits directly under the customer block; the
          column's slack goes below it, not above. */}
      <div className="flex flex-col gap-[32px]">
        <div className="flex w-full flex-col items-center justify-center bg-white px-[12px] py-[10px]">
          <div className="flex w-full flex-col gap-[10px]">
            <p className="w-full text-[16px] leading-[24px] font-semibold text-[#1e1e1e]">Order Summary</p>
            <div className="h-px w-full bg-[#eaeaea]" />
            <div className="flex w-full flex-col gap-[6px] text-[14px] leading-[20px] font-normal text-[#525252]">
              <p className="flex justify-between gap-[12px]">
                <span>Subtotal ({cart.length} item)</span>
                <span>{money(totals.subtotal)}</span>
              </p>
              <p className="flex justify-between gap-[12px]">
                <span>Shipping</span>
                <span>{money(totals.shipping)}</span>
              </p>
              <p className="flex justify-between gap-[12px]">
                <span>
                  Discount
                  {/* Where it came from, because a cashier asked for none and
                      sees one is owed an explanation. */}
                  {totals.offersOff > 0 && discount
                    ? " (offers + manual)"
                    : totals.offersOff > 0
                      ? " (product offers)"
                      : discount
                        ? discountMode === "percent"
                          ? ` (${discount}%)`
                          : " (flat)"
                        : ""}
                </span>
                <span>-{money(totals.discount)}</span>
              </p>
              {/* The rate is the shop's until somebody changes it here, and a
                  change applies to this sale only. Included VAT comes out of
                  the price, so the customer pays the same and only the split
                  moves. */}
              <p className="flex items-center justify-between gap-[12px]">
                <span className="flex items-center gap-[6px]">
                  VAT
                  {mayChangeVat ? (
                    <span className="flex h-[26px] items-center gap-[2px] rounded-[7px] bg-[#f5f5f5] px-[6px]">
                      <input
                        value={vat ?? String(+(shop.vatRate * 100).toFixed(2))}
                        onChange={(e) => setVat(e.target.value.replace(/[^\d.]/g, ""))}
                        inputMode="decimal"
                        aria-label="VAT rate for this sale"
                        className="w-[34px] bg-transparent text-center text-[13px] font-medium text-[#1e1e1e] outline-none tabular-nums"
                      />
                      <span className="text-[12px] text-[#8f8d87]">%</span>
                    </span>
                  ) : (
                    <span className="text-[13px] tabular-nums">
                      {+(vatRate * 100).toFixed(2)}%
                    </span>
                  )}
                  <span className="text-[12px] text-[#a3a3a3]">
                    {totals.addedTax > 0 && totals.inclusiveTax > 0
                      ? "part in price"
                      : totals.addedTax > 0
                        ? "added to total"
                        : "already in the price"}
                  </span>
                </span>
                <span>
                  {totals.addedTax > 0 && totals.inclusiveTax === 0 ? "+" : ""}
                  {money(Math.round(totals.tax))}
                </span>
              </p>
              {/* Said in words, because the figure on its own reads as an
                  addition and is not one. A shopkeeper looking at a 515.22
                  line, a 67 VAT line and a 515.22 total has every reason to
                  think the VAT was dropped — it was not, it is inside the
                  shelf price, and only this sentence says so. */}
              {totals.inclusiveTax > 0 && (
                <span className="text-[12px] text-[#8f8d87]">
                  {totals.addedTax > 0
                    ? `${money(Math.round(totals.inclusiveTax))} of the VAT is already inside the shelf price; the rest is added.`
                    : "VAT is already inside the shelf price, so the total does not change."}
                </span>
              )}
              {vat !== null && (
                <button
                  type="button"
                  onClick={() => setVat(null)}
                  className="cursor-pointer self-start text-[12px] text-[#f5b800] underline-offset-2 hover:underline"
                >
                  Back to the shop rate
                </button>
              )}
              {totals.capped && (
                <span className="text-[12px] text-[#e63946]">
                  Capped at {+(shop.maxDiscount * 100).toFixed(2)}% &mdash; the most this shop allows.
                </span>
              )}
            </div>
            <div className="h-px w-full bg-[#eaeaea]" />
            <p className="flex w-full justify-between gap-[12px] text-[16px] leading-[24px] font-semibold text-[#1e1e1e]">
              <span>Total</span>
              <span>{money(totals.total)}</span>
            </p>
          </div>
        </div>

        {status && <p className="text-[13px] text-[#525252]">{status}</p>}
      </div>

      {/* Payment buttons — Pay Cash & Pay Online */}
      <div className="mt-auto flex w-full items-center gap-[12px]">
        <button
          type="button"
          disabled={!cart.length || busy}
          onClick={() => {
            setPaymentMethod("Cash");
            pay("Cash");
          }}
          className="flex h-[48px] flex-1 cursor-pointer items-center justify-center rounded-[12px] bg-[#00bc2d] hover:bg-[#00a828] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && paymentMethod === "Cash" ? "Processing…" : "Pay Cash"}
        </button>
        <button
          type="button"
          disabled={!cart.length || busy}
          onClick={() => {
            setSelectedOnlineMethod(onlineMethods[0] || "Card");
            setReferenceNo("");
            setOnlineModalOpen(true);
          }}
          className="flex h-[48px] flex-1 cursor-pointer items-center justify-center rounded-[12px] bg-[#3300bc] hover:bg-[#2c00a3] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && paymentMethod !== "Cash" ? "Processing…" : "Pay Online"}
        </button>
      </div>

      {/* Pay Online Method Modal */}
      <Modal
        open={onlineModalOpen}
        onClose={() => !busy && setOnlineModalOpen(false)}
        title="Pay Online"
        width={440}
        footer={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOnlineModalOpen(false)}
              className="flex h-[40px] flex-1 cursor-pointer items-center justify-center rounded-[10px] border border-[#eaeaea] bg-white text-[14px] font-medium text-[#525252] hover:bg-[#fafafa]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!cart.length || busy || !selectedOnlineMethod}
              onClick={async () => {
                const m = selectedOnlineMethod;
                setPaymentMethod(m);
                await pay(m, referenceNo);
                setOnlineModalOpen(false);
              }}
              className="flex h-[40px] flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-[#3300bc] hover:bg-[#2c00a3] text-[14px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Processing…" : `Confirm ${money(totals.total)}`}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px] py-[8px]">
          {/* Total Payable Summary */}
          <div className="flex items-center justify-between rounded-[10px] bg-[#f8f7ff] p-[14px] border border-[#3300bc]/15">
            <div className="flex flex-col">
              <span className="text-[12px] font-medium text-[#525252]">Total Payable</span>
              <span className="text-[13px] text-[#8f8d87]">
                {cart.length} item{cart.length === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-[20px] font-bold text-[#3300bc]">{money(totals.total)}</span>
          </div>

          {/* Online Payment Method Options */}
          <div className="flex flex-col gap-[8px]">
            <label className="text-[13px] font-medium text-[#525252]">
              Select Payment Method
            </label>
            <div className="grid grid-cols-2 gap-[10px]">
              {onlineMethods.map((m) => {
                const isSelected = selectedOnlineMethod === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedOnlineMethod(m)}
                    className={`flex items-center justify-between gap-[8px] rounded-[10px] p-[12px] text-[14px] font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#3300bc] text-white shadow-sm ring-2 ring-[#3300bc]/30"
                        : "bg-[#fafafa] text-[#1e1e1e] border border-[#eaeaea] hover:bg-[#f0f0f0]"
                    }`}
                  >
                    <span className="truncate">{m}</span>
                    <span
                      className={`size-[16px] shrink-0 rounded-full border flex items-center justify-center ${
                        isSelected ? "border-white bg-white" : "border-[#a3a3a3]"
                      }`}
                    >
                      {isSelected && (
                        <span className="size-[8px] rounded-full bg-[#3300bc]" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transaction / Reference ID */}
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#525252]">
              Transaction / Reference ID <span className="text-[11px] text-[#8f8d87]">(optional)</span>
            </span>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g. TrxID or approval code"
              className="h-[40px] w-full rounded-[10px] border border-[#eaeaea] px-[12px] text-[14px] text-[#1e1e1e] placeholder:text-[#a3a3a3] outline-none focus:border-[#3300bc] transition-colors"
            />
          </label>
        </div>
      </Modal>

      {/* Order confirmed — no Figma frame; built in the app's own language. */}
      <Modal
        open={receipt !== null}
        onClose={() => setReceipt(null)}
        title="Order confirmed"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setReceiptOpen(true)}>
              Print receipt
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => setReceipt(null)}
            >
              New sale
            </button>
          </>
        }
      >
        {receipt && (
          <div className="flex flex-col items-center gap-[18px] text-center">
            {/* The tick draws itself once — a moment of completion, not decoration. */}
            <span className="sp-rise flex size-[64px] items-center justify-center rounded-full bg-[#f5fff8] ring-1 ring-[#00b837]/25">
              <svg className="block size-[32px]" viewBox="0 0 32 32" fill="none" aria-hidden>
                <path
                  d="M8 16.5l5.5 5.5L24 11"
                  stroke="#00b837"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={0}
                  style={{ animation: "sp-tick 420ms 120ms cubic-bezier(0.65,0,0.35,1) both" }}
                />
              </svg>
            </span>

            <div>
              <p className="text-[24px] leading-[1.25] font-medium tracking-[-0.5px] text-[#1e1e1e]">
                {money(receipt.total)}
              </p>
              <p className="mt-[4px] text-[13px] text-[#525252]">
                Paid by {receipt.method} · {receipt.at}
              </p>
            </div>

            <div className="w-full rounded-[10px] bg-[#fafafa] px-[14px] py-[12px]">
              <dl className="flex flex-col gap-[8px] text-[13px]">
                {[
                  ["Invoice", receipt.invoiceNo],
                  ["Customer", receipt.customer],
                  ["Items", `${receipt.items} product${receipt.items === 1 ? "" : "s"} · ${receipt.units} unit${receipt.units === 1 ? "" : "s"}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-[16px]">
                    <dt className="text-[#525252]">{k}</dt>
                    <dd className="truncate font-medium text-[#1e1e1e]">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="text-[12px] text-[#8a8a8a]">Thank you — the cart is ready for the next customer.</p>
          </div>
        )}
      </Modal>

      {/* Parked carts. Server-side, so a cart parked at one till can be taken
          back at another. */}
      <Modal
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        title="Parked carts"
        width={420}
        footer={
          <button type="button" className={MODAL_GHOST} onClick={() => setHeldOpen(false)}>
            Close
          </button>
        }
      >
        {held.length === 0 ? (
          <p className="py-[24px] text-center text-[14px] text-[#8f8d87]">
            Nothing is parked. Hold puts the current cart here.
          </p>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {held.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-[12px] rounded-[10px] px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-medium text-[#1e1e1e]">
                    {row.reference}
                  </span>
                  <span className="truncate text-[12px] text-[#8f8d87]">
                    {row.customerName} &middot; {row.items.length} item
                    {row.items.length === 1 ? "" : "s"}
                    {row.cashierName ? ` · ${row.cashierName}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-[8px]">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resumeCart(row)}
                    className="cursor-pointer rounded-[8px] bg-[#1e1e1e] px-[12px] py-[6px] text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    aria-label={`Discard ${row.reference}`}
                    onClick={() =>
                      PosService.dropHeldCart(row.id)
                        .then(() => invalidate("sales"))
                        .catch(() => setStatus("Could not discard that cart."))
                    }
                    className="cursor-pointer rounded-[8px] px-[10px] py-[6px] text-[13px] text-[#a3a3a3] transition-colors hover:bg-[#ffdfe2] hover:text-[#e63946]"
                  >
                    Discard
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* The printed receipt. Same component Sales, Returns and Purchases use —
          only the props differ. */}
      <Modal
        open={receiptOpen && receipt !== null}
        onClose={() => setReceiptOpen(false)}
        title="Receipt"
        width={380}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setReceiptOpen(false)}>
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
        {receipt && (
          <div className="print-area">
            <Receipt
              business={{
                name: shopProfile.name,
                tagline: shopProfile.tagline,
                address: shopProfile.address,
                bin: shopProfile.bin,
              }}
              title="SALES INVOICE"
              meta={[
                { label: "Customer", value: receipt.customer },
                { label: "Cashier", value: session.user?.name || "—" },
                { label: "Terminal ID", value: "POS" },
                { label: "Invoice No", value: receipt.invoiceNo },
                { label: "Date", value: receipt.at },
                ...(receipt.referenceNo ? [{ label: "Txn ID", value: receipt.referenceNo }] : []),
              ]}
              note="To enjoy special discount, please register as a VIP Member."
              itemsHeading="Item Description"
              items={receipt.lines.map((l) => ({
                name: l.name,
                price: l.price,
                qty: l.qty,
                total: l.total,
              }))}
              totals={[
                { label: "Sub Total:", value: receipt.subtotal.toLocaleString("en-IN") },
                { label: "(-)Discount:", value: receipt.discount.toLocaleString("en-IN") },
                {
                  label: shop.vatIncluded ? "VAT (in price):" : "(+)VAT:",
                  value: receipt.tax.toLocaleString("en-IN"),
                },
                {
                  label: "Total Amount:",
                  value: receipt.total.toLocaleString("en-IN"),
                  strong: true,
                  ruleAbove: true,
                },
                { label: "Paid by:", value: receipt.method },
                { label: "Net Payable:", value: receipt.total.toLocaleString("en-IN"), strong: true },
                { label: "Status:", value: "Paid" },
              ]}
              footerNotes={[
                `Thank you for shopping with ${shopProfile.name}`,
                ...(shopProfile.phone ? [`Any queries or complaints, please call ${shopProfile.phone}`] : []),
              ]}
              system={{ name: "SortPi", url: "www.sortpi.com" }}
            />
          </div>
        )}
      </Modal>

      {/* Add customer — no Figma frame; built in the app's own language. */}
      {addOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-[16px]"
          onMouseDown={(e) => e.target === e.currentTarget && setAddOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add new customer"
        >
          <form
            onSubmit={saveCustomer}
            className="flex w-full max-w-[420px] flex-col gap-[16px] rounded-[12px] bg-white p-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-center justify-between">
              <p className="text-[18px] leading-[1.5] font-medium tracking-[-0.36px] text-[#1e1e1e]">
                Add New Customer
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setAddOpen(false)}
                className="flex size-[32px] cursor-pointer items-center justify-center rounded-[8px] text-[#525252] transition-colors hover:bg-[#fafafa]"
              >
                <svg className="block size-[16px]" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <label className="flex flex-col gap-[6px]">
              <span className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]">Name</span>
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Customer name"
                aria-label="Customer name"
                className={`${FIELD} w-full text-[14px] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[rgba(82,82,82,0.6)]`}
              />
            </label>

            <label className="flex flex-col gap-[6px]">
              <span className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]">Phone</span>
              <input
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                placeholder="+880 1712-456 890"
                inputMode="tel"
                aria-label="Customer phone"
                className={`${FIELD} w-full text-[14px] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[rgba(82,82,82,0.6)]`}
              />
            </label>

            <div className="flex flex-col gap-[6px]">
              <span className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]">Type</span>
              <div className="flex gap-[8px]">
                {(["Regular", "VIP", "Premium"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, type: t }))}
                    className={`flex h-[40px] flex-1 cursor-pointer items-center justify-center rounded-[10px] text-[14px] font-medium transition-colors ${
                      draft.type === t
                        ? "border-[0.8px] border-solid border-[#f5b800] text-[#f5b800]"
                        : "border border-solid border-[#eaeaea] text-[#525252] hover:bg-[#fafafa]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {formError && <p className="text-[13px] text-[#ef4444]">{formError}</p>}

            <div className="mt-[4px] flex items-center gap-[12px]">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="flex h-[44px] flex-1 cursor-pointer items-center justify-center rounded-[12px] border border-solid border-[#eaeaea] bg-white text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
                }}
                className="flex h-[44px] flex-1 cursor-pointer items-center justify-center rounded-[12px] text-[14px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Customer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
