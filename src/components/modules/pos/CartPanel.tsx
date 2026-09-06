"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CartItem, CheckoutPayload, Customer, HeldCart, ProductItem } from "@/types/pos";
import { CustomerService, PosService, SettingsService } from "@/services";
import { useSession } from "@/services/useSession";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import Receipt from "@/components/shared/Receipt";

/**
 * Figma: SORTPoint — POS invoice column 45:2333.
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
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
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
      <button type="button" aria-label="Increase quantity" onClick={onInc} className={`${end} rounded-r-[4px]`}>
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState<"percent" | "flat">("percent");
  const [coupon, setCoupon] = useState("");
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  // How this shop charges VAT, and how much may come off a bill. Both are set
  // once in Settings; the till only reads them.
  const [shop, setShop] = useState({ vatRate: 0.15, vatIncluded: true, maxDiscount: 1 });
  // Empty means "the shop's usual rate". A figure here is this sale only.
  const [vat, setVat] = useState("");
  // Whose shop this is. The receipt is headed by the customer's company, not
  // by the software that printed it.
  const [shopProfile, setShopProfile] = useState({
    name: "",
    tagline: "",
    address: "",
    bin: "",
    phone: "",
  });
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

  /** What is parked at this branch right now. */
  const refreshHeld = () => {
    PosService.heldCarts()
      .then(setHeld)
      .catch(() => setHeld([]));
  };

  useEffect(() => {
    SettingsService.getValues()
      .then((v) => {
        const rate = Number(v["tax.default_rate"]);
        const cap = Number(v["pos.max_discount_percent"]);
        setShop({
          vatRate: Number.isFinite(rate) ? rate : 0.15,
          vatIncluded: String(v["tax.inclusive_by_default"] ?? "true") !== "false",
          maxDiscount: Number.isFinite(cap) && cap > 0 ? cap : 1,
        });
      })
      .catch(() => {});
    SettingsService.getCompanyProfile()
      .then((p) =>
        setShopProfile({
          name: p.companyName || "",
          tagline: p.businessType || "",
          address: p.address || "",
          bin: p.taxId || p.tradeLicenseBin || "",
          phone: p.phoneNumber || "",
        })
      )
      .catch(() => {});
    refreshHeld();
  }, []);

  useEffect(() => {
    PosService.getCustomers()
      .then((cs) => {
        setCustomers(cs);
        setCustomer((c) => c ?? cs[0] ?? null);
      })
      .catch(() => {});
  }, []);

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
      const created = await CustomerService.createCustomer({ name, phone, type: draft.type });
      const next: Customer = {
        id: created.id,
        name: created.name,
        phone: created.phone,
        type: draft.type,
      };
      setCustomers((cs) => [next, ...cs]);
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
      refreshHeld();
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
      refreshHeld();
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

  /** The rate this sale is taxed at: what was typed, or the shop's own. */
  const vatRate = vat.trim() === "" ? shop.vatRate : Math.max(0, Number(vat) || 0) / 100;

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
    // No delivery charge on a till sale. It used to add a flat 60 the server
    // has no field for, so the tender came to more than the bill and the sale
    // was refused with PAYMENT_EXCEEDS_TOTAL.
    const shipping = 0;
    const entered = Math.max(0, Number(discount) || 0);
    // Percentage caps at 100; a flat amount can never exceed the subtotal.
    const manualOff =
      discountMode === "percent" ? (subtotal * Math.min(100, entered)) / 100 : Math.min(subtotal, entered);
    // "SAVE10" is the only code the mock backend honours.
    const couponOff = coupon.trim().toUpperCase() === "SAVE10" ? subtotal * 0.1 : 0;
    // The shop's ceiling on what a till may give away, from Settings. Applied
    // here as well as at the till roll, so the figure on screen is the figure
    // the server will accept.
    const ceiling = subtotal * shop.maxDiscount;
    const off = Math.round(Math.min(subtotal, ceiling, manualOff + couponOff));
    const taxable = Math.max(0, subtotal - off);

    // Two ways to charge VAT, and they are not interchangeable. Bangladeshi
    // shelf prices normally include it, so it is taken OUT of the price rather
    // than added: the customer pays the same either way and the books differ.
    const tax = shop.vatIncluded
      ? taxable - taxable / (1 + vatRate)
      : taxable * vatRate;
    const total = shop.vatIncluded ? taxable : taxable + tax;

    return { subtotal, shipping, discount: off, tax, total, capped: manualOff + couponOff > ceiling };
  }, [cart, discount, discountMode, coupon, shop, vatRate]);

  const matches = customers.filter((c) =>
    c.name.toLowerCase().includes(customerQuery.trim().toLowerCase())
  );

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
  } | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const pay = async (method: CheckoutPayload["paymentMethod"]) => {
    if (!cart.length || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await PosService.checkout({
        customerId: customer?.id ?? "walk-in",
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.product.price,
        })),
        paymentMethod: method,
        discountCode: coupon.trim() || undefined,
        discountAmount: totals.discount,
        // Only when it was changed here. The shop's own rate needs no saying,
        // and sending it would need a permission a cashier does not hold.
        ...(vat.trim() !== "" ? { taxRate: vatRate } : {}),
        // What the shopper hands over: the bill after the discount, which is
        // what the server will have priced it at.
        totalAmount: totals.total,
      });
      setReceipt({
        invoiceNo: res?.invoiceNo ?? `INV-${Date.now().toString().slice(-8)}`,
        method: method === "Cash" ? "Cash" : "Online",
        items: cart.length,
        units: cart.reduce((n, i) => n + i.quantity, 0),
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        discount: totals.discount,
        tax: Math.round(totals.tax),
        total: totals.total,
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
      });
      setStatus(null);
      onClearCart();
      setDiscount("");
      setCoupon("");
      setVat("");
    } catch {
      setStatus("Payment failed. Try again.");
    } finally {
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
                  refreshHeld();
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
                  setCoupon("");
                  setVat("");
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
                            <Image src={item.product.image || "/placeholder-product.svg"} alt="" fill sizes="24px" className="object-cover" />
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
                          <span className="text-[14px] leading-[1.5] font-normal whitespace-nowrap text-[#525252]">
                            {money(item.product.price)}
                          </span>
                        </div>
                        <div className="flex w-[150px] shrink-0 items-center justify-center p-[12px]">
                          <Stepper
                            value={item.quantity}
                            onDec={() => onUpdateQuantity(item.product.id, -1)}
                            onInc={() => onUpdateQuantity(item.product.id, 1)}
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
                    placeholder="Search customer by name..."
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

            <div className="flex flex-col gap-[21px] sm:flex-row sm:items-center">
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
              <div className={`${FIELD} min-w-0 flex-1`}>
                <span className="text-[rgba(82,82,82,0.6)]">
                  <CouponIcon />
                </span>
                <input
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                  placeholder="Coupon Code"
                  aria-label="Coupon code"
                  className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
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
                <span>Discount{discount ? (discountMode === "percent" ? ` (${discount}%)` : " (flat)") : ""}</span>
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
                        value={vat === "" ? String(+(shop.vatRate * 100).toFixed(2)) : vat}
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
                    {shop.vatIncluded ? "in price" : "added"}
                  </span>
                </span>
                <span>{shop.vatIncluded ? "" : "+"}{money(Math.round(totals.tax))}</span>
              </p>
              {vat.trim() !== "" && (
                <button
                  type="button"
                  onClick={() => setVat("")}
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

      {/* Pay — mt-auto puts this on the same line as the product grid's
          pagination bar, and both are 48px tall. */}
      <div className="mt-auto flex w-full items-center gap-[16px]">
          <button
            type="button"
            disabled={!cart.length || busy}
            onClick={() => pay("Cash")}
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(82,82,82) 0%, rgb(82,82,82) 100%)",
            }}
            className="flex h-[48px] w-[154px] shrink-0 cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cash Pay
          </button>
          <button
            type="button"
            disabled={!cart.length || busy}
            onClick={() => pay("Online")}
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
            }}
            className="flex h-[48px] min-w-px flex-1 cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Processing…" : "Pay Online"}
          </button>
      </div>

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
                        .then(refreshHeld)
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
              system={{ name: "SORTPoint", url: "www.sortpoint.com" }}
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
