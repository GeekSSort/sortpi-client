"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CartItem, Customer, HeldCart, ProductItem } from "@/types/pos";
import { CustomerService, PosService, SettingsService } from "@/services";
import { useSession } from "@/services/useSession";
import { useQuery, useMutation, queryKey, invalidate } from "@/lib/query/useQuery";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import Receipt from "@/components/shared/Receipt";
import ProductImage from "@/components/shared/ProductImage";
import VariantChip from "@/components/shared/VariantChip";
import { useProductDiscounts } from "@/lib/usePosDiscounts";
import { amountOff } from "@/services/discountService";
import { usePosDraft, patchPosDraft } from "@/components/modules/pos/posCart";
import { parseOnlineMethods } from "@/lib/paymentMethods";
import { readLoyaltyRules, blocksIn, discountForPoints, redeemablePoints } from "./loyalty";
import { CouponService, type CouponCheck } from "@/services";
import PaymentFields, { PaymentEntry, EMPTY_ENTRY, payableWith, dueFor } from "./PaymentFields";
import { paymentStateOf } from "@/services/mappers/sale";

/**
 * Figma: SortPi — POS invoice column 45:2333.
 *
 * 565-wide column, 958 tall in the frame: the invoice header, cart table and
 * customer summary sit at the top, the order summary and pay buttons at the
 * bottom (45:2334 / 45:2480 are 173px apart in the frame, i.e. justified).
 */

/**
 * Every amount on this screen, to the paisa. Always two decimals, never three.
 *
 * `toLocaleString` with no options defaults to a MAXIMUM of three fraction
 * digits and a minimum of none, which is two bugs in one call: ৳100 printed as
 * "100" where the line beside it said "99.50", and a percentage coupon printed
 * its third decimal — 10% off ৳333.33 came out as "৳33.333", a figure in a
 * currency whose smallest unit is the paisa.
 *
 * Two decimals always, so a column of amounts lines up on the point and every
 * figure is one a drawer can actually hold.
 */
const amount = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const money = (n: number) => `৳${amount(n)}`;

/**
 * Why "Amount received" is fixed at the bill when it is.
 *
 * There is only one reason left: the shop has not switched part payment on.
 * It names the switch, because "you cannot type here" without saying where the
 * setting lives is what sent cashiers to the manager.
 */
const LOCK_REASON =
  "Part payment is off for this shop — turn on Settings \u2192 Allow partial payment to take less than the bill.";

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
/**
 * The stepper's middle, as a field.
 *
 * Text while it is being edited: a controlled number loses the "." of "2."
 * on the keystroke that types it, so a half-metre could not be entered at
 * all. It becomes a number on blur or Enter, and an empty box falls back to
 * what was there rather than setting the line to nothing.
 */
function StepperInput({
  value,
  allowDecimal,
  unitShort,
  onSet,
}: {
  value: number;
  allowDecimal: boolean;
  unitShort: string;
  onSet: (next: number) => void;
}) {
  const shown = String(value);
  const [text, setText] = useState(shown);
  const mine = useRef(shown);
  useEffect(() => {
    if (shown !== mine.current) {
      mine.current = shown;
      setText(shown);
    }
  }, [shown]);

  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) {
      setText(shown);
      return;
    }
    mine.current = String(n);
    onSet(n);
  };

  return (
    <span className="flex h-[30px] w-[52px] shrink-0 items-center justify-center border-y-[0.4px] border-solid border-[#525252] px-[2px]">
      <input
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        aria-label="Quantity"
        value={text}
        onChange={(e) => {
          let next = e.target.value.replace(/[^\d.]/g, "");
          // A whole-number unit gets no dot: the server refuses 2.5 pieces,
          // and the honest moment to say so is while it is typed.
          if (!allowDecimal) next = next.replace(/\./g, "");
          else {
            const dot = next.indexOf(".");
            if (dot !== -1) {
              next = next.slice(0, dot + 1) + next.slice(dot + 1).replace(/\./g, "");
              // NUMERIC(18,3) — three places, no more.
              next = next.slice(0, dot + 4);
            }
          }
          setText(next);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-full bg-transparent text-center text-[12px] leading-[16px] font-medium text-[#525252] tabular-nums outline-none"
      />
      {unitShort ? <span className="pr-[2px] text-[10px] text-[#8f8d87]">{unitShort}</span> : null}
    </span>
  );
}

function Stepper({
  value,
  onDec,
  onInc,
  onSet,
  allowTyping = false,
  allowDecimal = false,
  unitShort = "",
  atCap = false,
  stock,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  /** Set it outright, from the typed box. */
  onSet?: (next: number) => void;
  /** `pos.allow_manual_quantity`. Off, the middle is a label, not a field. */
  allowTyping?: boolean;
  /** Whether this product's unit can be sold in fractions. */
  allowDecimal?: boolean;
  /** "pcs", "m", "kg" — what the figure is counted in. */
  unitShort?: string;
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
      {allowTyping && onSet ? (
        <StepperInput
          value={value}
          allowDecimal={allowDecimal}
          unitShort={unitShort}
          onSet={onSet}
        />
      ) : (
        <span className="flex h-[30px] w-[52px] shrink-0 flex-col items-center justify-center border-y-[0.4px] border-solid border-[#525252] px-[4px] py-[4px] text-center text-[12px] leading-[16px] font-medium text-[#525252]">
          {value}
          {unitShort ? <span className="text-[10px] text-[#8f8d87]">{unitShort}</span> : null}
        </span>
      )}
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
  /** Set a quantity outright, from the typed box. */
  onSetQuantity?: (productId: string, next: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  /** False in the three-column view, where the middle column lists the items. */
  showItems?: boolean;
  /** Puts a whole cart back, which Hold/Start needs. */
  onRestoreCart: (items: CartItem[]) => void;
}

/**
 * A fresh idempotency key.
 *
 * At MODULE scope, not inside the component. `Date.now` and `Math.random` are
 * impure, and the React Compiler refuses them in anything it reads as render
 * code — which it reads every function declared in a component body as, since
 * it cannot prove the call sites are all event handlers. Out here there is
 * nothing to prove: this is not part of any render.
 *
 * Both halves earn their place. The clock makes two keys minted a second apart
 * different even if the random half collides; the random half makes two tills
 * that pressed Confirm in the same millisecond different.
 */
function newCheckoutKey(): string {
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * What the receipt shows when the server's answer carried no invoice number.
 *
 * A visible placeholder rather than a blank: the sale IS booked by this point,
 * and a receipt with nothing where the number goes is the one a customer
 * brings back. Module scope for the same reason as above.
 */
function fallbackInvoiceNo(): string {
  return `INV-${Date.now().toString().slice(-8)}`;
}

export default function CartPanel({
  cart,
  onUpdateQuantity,
  onSetQuantity,
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

  /**
   * The payment dialog's figures — one set, whichever button opened it.
   *
   * Reset on open rather than on close: a dialog dismissed and reopened must
   * not still hold the last sale's surcharge.
   */
  const [entry, setEntry] = useState<PaymentEntry>(EMPTY_ENTRY);
  /**
   * Points being spent on this sale.
   *
   * Reset whenever a payment dialog opens, like the rest of the entry: a
   * dialog dismissed and reopened must not still be spending the last sale's
   * points, and the customer may have changed in between.
   */
  /**
   * Whether this sale spends the customer's points. A YES/NO, not a figure.
   *
   * It used to be a number a cashier typed into the payment dialog, which had
   * two problems and one of them was a defect: the box could hold a figure the
   * rules no longer allowed — 300 points against a bill that had since shrunk
   * to ৳80 — and the server refused the sale at the counter. Derived from this
   * flag against the CURRENT bill, the figure cannot go stale, because there
   * is no figure to go stale.
   */
  const [usePoints, setUsePoints] = useState(false);
  /**
   * The coupon code typed at the till, and what the SERVER says it is worth.
   *
   * The discount is never worked out here. The till asks
   * `POST /coupons/check/` so the cashier can see the answer before the
   * customer is charged, and `POST /sales/` resolves the same code again and
   * prices the sale from the coupon row — so a modified client cannot write
   * its own number, which is exactly what the version before this one allowed.
   */
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponCheck | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [cashModalOpen, setCashModalOpen] = useState(false);

  /** The server refuses a surcharge with no reason; the button waits for one. */
  const entryReady = entry.additional <= 0 || entry.reason.trim().length > 0;




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
      // Whether a cashier may take less than the bill. OFF is what the till
      // did before the payment dialog existed: it pays the amount owed.
      allowPartial: String(shopValues?.["pos.allow_partial_payment"] ?? "false") === "true",
      // Whether a cashier may type a quantity rather than only stepping it.
      allowManualQuantity:
        String(shopValues?.["pos.allow_manual_quantity"] ?? "false") === "true",
    };
  }, [shopValues]);

  /**
   * Can this sale be part paid?
   *
   * The shop setting, and nothing else. It used to ALSO require a customer to
   * have been picked by hand, which made the setting look broken: turn part
   * payment on, open the dialog, and "Amount received" was still read-only.
   * The invoice is not customer-less either way — it falls back to the first
   * customer on file (see `customer` above), so the lock was refusing a tender
   * against an account the sale was about to be booked to anyway.
   *
   * Whether the remainder may actually be carried is the SERVER's call: it
   * refuses a debt against a customer whose credit limit is zero, with
   * CREDIT_NOT_ALLOWED. That limit is not on this screen, so the refusal is
   * shown inside the payment dialog — which stays open on failure — rather
   * than guessed at here.
   */
  const partialAvailable = shop.allowPartial;


  /**
   * The non-cash tenders this shop takes, exactly as ticked in Settings and in
   * the order shown there.
   *
   * The parsing lives in `paymentMethods.ts` with the catalogue the settings
   * boxes are built from. It used to live here, with its own fallback list and
   * a special case that appended "Others" to one exact spelling of the old
   * default — so the till and the settings screen could disagree about what a
   * shop accepted, and did.
   */
  const onlineMethods = useMemo(
    () => parseOnlineMethods(shopValues?.["pos.online_payment_methods"]),
    [shopValues]
  );
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
  const customer = useMemo(() => {
    const picked = pickedCustomer ?? customers[0] ?? null;
    if (!picked?.id) return picked;
    // RE-RESOLVED against the live list, every render.
    //
    // The draft stores WHO the sale is for, and it stores a whole customer
    // object — captured when the cashier picked them, and persisted to
    // localStorage so an interrupted sale survives. That copy carries a
    // `loyaltyPoints` figure that was true at the moment of picking and never
    // again: ring the sale up, the points move on the server, `pos-customers`
    // refetches with the new balance — and the badge beside the name went on
    // showing the old one until somebody reloaded the till, because nothing
    // was reading the refreshed row.
    //
    // So the draft supplies the IDENTITY and the list supplies the FIGURES.
    // Falling back to the snapshot keeps a sale standing if the customer drops
    // out of the first hundred rows the till holds.
    return customers.find((row) => row.id === picked.id) ?? picked;
  }, [pickedCustomer, customers]);
  /**
   * The shop's points scheme, and this customer's wallet.
   *
   * The panel is absent unless the scheme is ON and a real customer is on the
   * invoice: a walk-in has no wallet to spend from or earn into. `customer` is
   * the one the sale is actually booked against — the picked one, or the
   * fallback — so the panel and the sale cannot disagree about whose points
   * these are.
   */
  const loyaltyRules = useMemo(() => readLoyaltyRules(shopValues), [shopValues]);
  const loyaltyCustomer = customer && customer.id ? customer : null;
  const pointsBalance = loyaltyCustomer?.loyaltyPoints ?? 0;
  const showPoints = loyaltyRules.enabled && loyaltyCustomer !== null;

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
        // A customer created at the counter has an empty wallet. Points arrive
        // when this sale is booked, not before it.
        loyaltyPoints: 0,
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
          name: i.product.fullName,
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
   * What Confirm is about to take, and what it will leave owing.
   *
   * It used to print `payableWith(total, entry)` — the BILL — so a dialog
   * with nothing in the amount field still read "Confirm ৳1,000", and the
   * button a cashier presses gave them no way to tell a full payment from a
   * part one. It now names the TENDER, which is the figure that reaches the
   * drawer, and the remainder when there is one: the last chance to catch an
   * amount typed into the wrong field before the sale becomes an
   * insert-only row.
   */
  /**
   * The bill BEFORE points, and what points take off it.
   *
   * Points come off after the surcharge and after tax: they are money the
   * customer already holds, not a price change, so nothing about the VAT on
   * what was bought moves because of how it was paid for. The server applies
   * the identical rule — see `_resolve_redemption`.
   */
  const grossPayable = payableWith(totals.total, entry);
  /**
   * The coupon, off the bill BEFORE the points.
   *
   * The same order the server uses: a coupon is a concession on the PRICE, and
   * the points are then spent against what is actually left to pay. The figure
   * is whatever `POST /coupons/check/` answered for the bill it was checked
   * against — re-checked whenever the basket moves, so a percentage coupon
   * cannot go stale against a cart that has since changed.
   */
  const couponOff = coupon ? Math.min(coupon.discount, grossPayable) : 0;
  const afterCoupon = Math.max(0, grossPayable - couponOff);
  /** The most this bill can take from the wallet, under the shop's own rules. */
  const maxRedeemable = showPoints
    ? redeemablePoints(loyaltyRules, pointsBalance, afterCoupon)
    : 0;
  const redeem = usePoints ? maxRedeemable : 0;
  const pointsOff = showPoints ? discountForPoints(loyaltyRules, redeem, afterCoupon) : 0;
  const netPayable = Math.max(0, afterCoupon - pointsOff);
  /** "3%" — only the PERCENT scheme has one to show. */
  const pointsPercent =
    loyaltyRules.redeemMode === "PERCENT" ? blocksIn(loyaltyRules, redeem) * loyaltyRules.redeemPercent : 0;



  /**
   * What the tender box starts at when a payment dialog opens.
   *
   * `netPayable` rather than the bill: with points applied the two differ, and
   * seeding the gross figure tendered MORE than the sale is worth — which the
   * server refuses, at the counter, with the customer waiting. The dialog is
   * opened from a fresh `EMPTY_ENTRY`, so there is no surcharge yet and the
   * gross is simply the cart total.
   */
  /**
   * Ask the server what a code is worth, and hold the answer.
   *
   * Checked against the CURRENT bill, because a percentage coupon is worth
   * more on a bigger basket — and re-checked when the basket changes, below,
   * so the figure on screen is never one the sale would not honour.
   */
  const applyCoupon = async (typed: string) => {
    const code = typed.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const answer = await CouponService.check(code, payableWith(totals.total, entry));
      setCoupon(answer);
      setCouponCode(answer.code);
    } catch (error) {
      setCoupon(null);
      setCouponError(
        error instanceof Error && error.message
          ? error.message
          : "That code could not be checked. Try again."
      );
    } finally {
      setCouponBusy(false);
    }
  };

  const clearCoupon = () => {
    setCoupon(null);
    setCouponCode("");
    setCouponError(null);
  };

  // RE-CHECKED when the bill moves. A percentage coupon applied to a ৳1,600
  // basket is worth ৳160; add another bottle and it is worth more, and a
  // figure the till kept from the first check would be one the sale refuses
  // to honour. Only the amount changes — the code stays applied.
  const checkedAgainst = useRef<number | null>(null);
  useEffect(() => {
    if (!coupon) {
      checkedAgainst.current = null;
      return;
    }
    const bill = payableWith(totals.total, entry);
    if (checkedAgainst.current === bill) return;
    checkedAgainst.current = bill;
    let cancelled = false;
    CouponService.check(coupon.code, bill)
      .then((answer) => {
        if (!cancelled) setCoupon(answer);
      })
      .catch(() => {
        // A code that stops working mid-sale — switched off from Settings
        // while a basket was open — drops off rather than quietly holding an
        // old discount the sale would refuse.
        if (!cancelled) {
          setCoupon(null);
          setCouponError("That code is no longer available.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coupon, totals.total, entry]);

  const openingTender = (): number => {
    const gross = totals.total;
    const off = showPoints
      ? discountForPoints(
          loyaltyRules,
          usePoints ? redeemablePoints(loyaltyRules, pointsBalance, gross) : 0,
          gross
        )
      : 0;
    return Math.max(0, gross - off);
  };

  const confirmLabel = (): string => {
    const taking = shop.allowPartial ? Math.max(0, entry.received || 0) : netPayable;
    const left = netPayable - taking;
    // Half a paisa of float noise is not a debt.
    return left <= 0.005
      ? `Confirm ${money(taking)}`
      : `Confirm ${money(taking)} · ${money(left)} due`;
  };

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
    /** What was actually taken. Below `total` on a part payment. */
    paid: number;
    /** What is still owed and has gone on the customer's account. */
    due: number;
    customer: string;
    /** Blank for a walk-in, who has no number to print. */
    customerPhone: string;
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
    const key = newCheckoutKey();
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

  /**
   * The server's refusal, on top of the dialog that caused it.
   *
   * `status` renders behind these modals, so a 400 — no stock, a closed shift,
   * CREDIT_NOT_ALLOWED on a part payment — was invisible: the dialog simply
   * stayed open with nothing said. The cashier has to read it where they are
   * looking, which is here.
   */
  const payError = status ? (
    <p
      role="alert"
      className="rounded-[8px] border border-[#f5c2c2] bg-[#fff5f5] px-[12px] py-[8px] text-[13px] text-[#c80000]"
    >
      {status}
    </p>
  ) : null;

  /**
   * `tender` is REQUIRED, deliberately.
   *
   * It defaulted to `EMPTY_ENTRY` — received zero — which was harmless only
   * while a zero tender was silently rewritten to the full bill further down.
   * Now that zero means zero, a caller that forgot to pass the dialog's entry
   * would book the sale entirely on account. Making it required moves that
   * from a silent money bug to a compile error.
   */
  const pay = async (method: string, refNo: string | undefined, tender: PaymentEntry) => {
    if (!cart.length || paying.current || busy) return;
    paying.current = true;
    // Read ONCE, here, so the amount sent and the amount signed into the
    // idempotency key are the same figure — and so a shop with the scheme off
    // sends nothing whatever is left in the box.
    const redeemNow = showPoints ? redeem : 0;
    // Everything the request body is built from. Two attempts that would post
    // the same body share a key; anything else gets its own.
    const signature = JSON.stringify([
      cart.map((i) => [i.product.id, i.quantity, i.product.price]),
      customer?.id ?? "walk-in",
      totals.manualDiscount,
      coupon?.code ?? "",
      vat,
      method,
      refNo ?? referenceNo ?? "",
      totals.total,
      tender.additional,
      tender.reason,
      tender.received,
      redeemNow,
    ]);
    setBusy(true);
    setStatus(null);
    let sold = false;
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
        /**
         * What the shopper ACTUALLY handed over. Nothing is a real answer.
         *
         * This used to read `tender.received > 0 ? tender.received : total`,
         * which was written when the dialog always opened pre-filled with the
         * whole bill — `received` could not be zero, so the fallback never
         * fired. Part payment opens it at zero, and the fallback then turned
         * the commonest mistake at a till into the worst one: a cashier who
         * confirmed without typing an amount booked a sale as PAID IN FULL,
         * printed a receipt saying so, and left nothing owing against a
         * customer who had handed over nothing.
         *
         * Zero now means zero — the whole bill goes on the account and the
         * sale is Unpaid, which is a state the server, the sales list and the
         * receipt all already understand. The locked case still tenders the
         * full bill, because that is what the locked field says it is doing.
         */
        // NET of any points, both ways. The server takes the redemption off
        // the grand total, so tendering the gross bill overshoots it by
        // exactly the discount — and the locked field on screen is already
        // showing the net figure, so sending the gross would also mean the
        // till sent a number it never displayed.
        totalAmount: shop.allowPartial
          ? Math.max(0, tender.received || 0)
          : netPayable,
        // The bill this tender is measured against, surcharge included. It is
        // NOT sent as a total — the server prices the sale itself — but the
        // service needs it to tell a part payment from one that overshoots.
        // Net of any points, because that is the bill the tender is measured
        // against — a customer who spent 200 points on a ৳1,000 sale hands
        // over ৳900, and calling that a part payment would put ৳100 on their
        // account for money they already paid in points.
        payableAmount: netPayable,
        ...(tender.additional > 0
          ? {
              extraChargeAmount: tender.additional,
              extraChargeReason: tender.reason.trim(),
            }
          : {}),
        /**
         * The points being spent — an INPUT, not a discount.
         *
         * The server reads the shop's rules and the customer's real balance
         * and works out what they are worth. Sending the money instead would
         * let a till set its own exchange rate, and a request naming more
         * points than are held is refused there rather than here.
         */
        ...(redeemNow > 0 ? { redeemPoints: redeemNow } : {}),
        // The CODE, and nothing else. The server resolves it against the
        // coupon row and prices the sale from that — sending a figure would be
        // the till deciding its own discount, which is what the disabled field
        // this replaces existed to prevent.
        ...(coupon ? { couponCode: coupon.code } : {}),
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
        invoiceNo: res?.invoiceNo ?? fallbackInvoiceNo(),
        method: method,
        items: cart.length,
        units: cart.reduce((n, i) => n + i.quantity, 0),
        subtotal: booked?.subtotal ?? totals.subtotal,
        shipping: totals.shipping,
        discount: booked?.discount ?? totals.discount,
        tax: Math.round(booked?.tax ?? totals.tax),
        total: booked?.grandTotal ?? totals.total,
        /**
         * The RECORDED settlement, not the tender that was typed.
         *
         * The server is what decides how much of this sale is paid — it
         * prices the basket itself, and a tender is measured against its
         * figure, not the till's. The fallbacks are the till's own arithmetic
         * for a response that carries neither, which is the same rule the
         * totals above follow.
         */
        paid:
          booked?.paid ??
          (shop.allowPartial
            ? Math.max(0, tender.received || 0)
            : payableWith(totals.total, tender)),
        // Locked, the tender IS the bill, so nothing can be outstanding —
        // stating that beats deriving it from an entry the locked field was
        // only ever displaying.
        due: booked?.due ?? (shop.allowPartial ? dueFor(totals.total, tender) : 0),
        lines: cart.map((i) => ({
          name: i.product.fullName,
          price: amount(i.product.price),
          qty: i.quantity,
          total: amount(i.product.price * i.quantity),
        })),
        customer: customer?.name ?? "Walk-in Customer",
        customerPhone: customer?.phone ?? "",
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
      // `pos-customers` too: this sale moved the buyer's points, and the till
      // shows that balance beside their name. Without it the next sale offers
      // points that have already been spent.
      invalidate("sales", "stock", "inventory", "dashboard", "pos-products", "pos-customers");
      sold = true;
      // This cart is booked. The next one is a new sale and needs a new key —
      // reusing this one would make the server replay the sale just made and
      // hand back its receipt instead of ringing the new basket.
      checkoutKey.current = null;

      onClearCart();
      setDiscount("");
      clearCoupon();
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
      return false;
    } finally {
      paying.current = false;
      setBusy(false);
    }
    return sold;
  };

  // The two gaps below decide how much of this column is white space: the
  // outer one sits above ORDER SUMMARY and the inner one above CUSTOMER
  // SUMMARY. At the Figma figures (32 and 36) the invoice column spent nearly
  // seventy pixels on two blank bands, which on a laptop till pushed the
  // totals under the fold — so the cashier had to scroll to see what the
  // customer owes.
  return (
    <div className="flex h-full min-h-full w-full flex-col gap-[16px]">
      <div className="flex flex-col gap-[18px]">
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
                          {/* Name truncates, chip does not.
                              `fullName` in one span truncated "Coca-Cola 500ml"
                              to "Coca-Cola 5…" in this column — losing exactly
                              the half that tells two lines apart. The chip is
                              shrink-0, so the size survives any width. */}
                          <span className="truncate text-[14px] leading-[24px] font-normal text-[#525252]">
                            {item.product.name}
                          </span>
                          <VariantChip label={item.product.variantLabel} size="xs" />
                          <button
                            type="button"
                            aria-label={`Remove ${item.product.fullName}`}
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
                            onSet={(next) => onSetQuantity?.(item.product.id, next)}
                            allowTyping={shop.allowManualQuantity}
                            allowDecimal={item.product.allowDecimal}
                            unitShort={item.product.unitShort}
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
                      <span className="flex min-w-0 items-center justify-between gap-[8px]">
                        <span className="min-w-0 truncate">
                          {c.name}
                          <span className="text-[#a3a3a3]"> · {c.phone || "no phone"}</span>
                        </span>
                        {loyaltyRules.enabled && c.id && c.loyaltyPoints > 0 && (
                          <span className="shrink-0 text-[11px] font-semibold text-[#8a6200]">
                            {c.loyaltyPoints.toLocaleString("en-IN")} pts
                          </span>
                        )}
                      </span>
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
                  <span className="flex min-w-0 items-center gap-[8px]">
                    <span className="truncate text-[12px] leading-[1.4] text-[#8f8d87]">
                      {customer ? customer.phone || "no phone on file" : "no customer chosen"}
                    </span>
                    {/* The wallet, where the cashier is already looking.
                        Only once the shop runs a scheme AND there is a real
                        customer — a walk-in has no wallet, and a shop with the
                        setting off must see nothing about points anywhere. */}
                    {showPoints && (
                      <span className="shrink-0 rounded-full bg-[#fff8e1] px-[8px] py-[1px] text-[11px] font-semibold text-[#8a6200] ring-1 ring-[#f2e0a8] ring-inset">
                        {pointsBalance.toLocaleString("en-IN")} pts
                      </span>
                    )}
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

            {/* The customer's points, where the customer is.
                One line and one decision: spend them or do not. The detail —
                what they had, what this earns, what they leave with — used to
                sit inside the payment dialog, where it answered a question
                nobody asks while money is being counted and pushed the amount
                box off a short screen.

                Shown only when the shop runs a scheme AND a real customer is
                on the sale: a walk-in has no wallet, and a shop with the
                setting off must see nothing about points anywhere. */}
            {showPoints && (
              <div className="flex flex-col gap-[6px] rounded-[10px] border border-solid border-[#f2e0a8] bg-[#fffdf5] px-[12px] py-[10px]">
                <label
                  className={`flex items-center gap-[10px] ${
                    maxRedeemable > 0 ? "cursor-pointer" : "cursor-not-allowed"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={usePoints && maxRedeemable > 0}
                    disabled={maxRedeemable <= 0 || busy}
                    onChange={(e) => setUsePoints(e.target.checked)}
                    aria-label="Use customer points"
                    className="size-[16px] shrink-0 cursor-pointer accent-[#f5b800] disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 flex-1 text-[13px] font-medium text-[#1e1e1e]">
                    Use customer points
                  </span>
                  <span className="shrink-0 text-[12px] text-[#8a6200]">
                    Available:{" "}
                    <span className="font-semibold tabular-nums">
                      {pointsBalance.toLocaleString("en-IN")}
                    </span>{" "}
                    points
                  </span>
                </label>

                {redeem > 0 ? (
                  // The result, in one line: what it is worth, what it costs,
                  // and what stays in the wallet when only part can be spent.
                  <p className="text-[12px] leading-[1.6] text-[#8a6200]">
                    <span className="font-semibold text-[#1f9d55]">
                      {pointsPercent > 0 ? `${pointsPercent}% discount` : `${money(pointsOff)} off`}
                    </span>{" "}
                    · {redeem.toLocaleString("en-IN")} points
                    {pointsBalance > redeem && (
                      <> used · {(pointsBalance - redeem).toLocaleString("en-IN")} points remaining</>
                    )}
                  </p>
                ) : (
                  // WHY nothing can be spent. "No points" and "not enough
                  // points yet" are different conversations at a counter, and
                  // a box that says neither sends the cashier to ask somebody.
                  <p className="text-[12px] leading-[1.6] text-[#8f8d87]">
                    {pointsBalance <= 0
                      ? "No points yet — this sale will start them off."
                      : pointsBalance < loyaltyRules.minRedeemPoints
                        ? `${loyaltyRules.minRedeemPoints.toLocaleString("en-IN")} points are needed before any can be used.`
                        : cart.length === 0
                          ? "Add something to the sale to use these points."
                          : "Not enough on this bill to use any."}
                  </p>
                )}
              </div>
            )}

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
              {/* LIVE now that there is a coupon resource to check a code
                  against. It was disabled for exactly as long as there was
                  not: what it replaces gave a real 10% away for the literal
                  string "SAVE10", worked out in this file, with no authority
                  behind it anywhere. Nothing here decides what a code is
                  worth — the server answers, and prices the sale itself. */}
              <div className={`${FIELD} min-w-0 flex-1`}>
                <span className="text-[rgba(82,82,82,0.6)]">
                  <CouponIcon />
                </span>
                <input
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    setCouponError(null);
                    // Typing over an applied code drops it: the discount on
                    // screen has to belong to the code in the box.
                    if (coupon) setCoupon(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    void applyCoupon(couponCode);
                  }}
                  disabled={busy || couponBusy}
                  placeholder="Coupon Code"
                  aria-label="Coupon code"
                  className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] uppercase outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
                {coupon ? (
                  <button
                    type="button"
                    onClick={clearCoupon}
                    disabled={busy}
                    className="shrink-0 cursor-pointer text-[12px] font-semibold whitespace-nowrap text-[#8f8d87] transition-colors hover:text-[#c62828]"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void applyCoupon(couponCode)}
                    disabled={busy || couponBusy || !couponCode.trim()}
                    className="shrink-0 cursor-pointer text-[12px] font-semibold whitespace-nowrap text-[#b58600] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {couponBusy ? "Checking…" : "Apply"}
                  </button>
                )}
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
              {/* The coupon, above the points and on its own row — the same
                  order the server applies them in, and the same reason they
                  are not one line: a coupon is the SHOP's concession and the
                  points are the CUSTOMER's own money. */}
              {couponOff > 0 && coupon && (
                <p className="flex justify-between gap-[12px]">
                  <span>
                    Coupon
                    <span className="text-[12px] text-[#a3a3a3]">
                      {" "}
                      ({coupon.code}
                      {coupon.mode === "PERCENT" ? `, ${+coupon.value.toFixed(2)}%` : ""})
                    </span>
                  </span>
                  <span className="text-[#1f9d55]">-{money(couponOff)}</span>
                </p>
              )}
              {couponError && (
                <p className="text-[12px] leading-[1.5] text-[#e63946]">{couponError}</p>
              )}
              {/* Points, on a row of their OWN.
                  Not folded into the Discount line above it: that line is what
                  the SHOP took off — offers and whatever the cashier typed —
                  and this is what the CUSTOMER paid for with points they had
                  already earned. Added together they would be one figure
                  nobody could take apart, and the first question at the
                  counter is which of the two moved. */}
              {pointsOff > 0 && (
                <p className="flex justify-between gap-[12px]">
                  <span>
                    Points discount
                    <span className="text-[12px] text-[#a3a3a3]">
                      {" "}
                      ({pointsPercent > 0
                        ? `${pointsPercent}%, `
                        : ""}
                      {redeem.toLocaleString("en-IN")} pts)
                    </span>
                  </span>
                  <span className="text-[#1f9d55]">-{money(pointsOff)}</span>
                </p>
              )}
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
            {/* NET of the points, because that is what will be charged.
                Showing the gross here and the net in the payment dialog gave
                a cashier two different totals for one sale and no way to tell
                which the customer was about to pay. */}
            <p className="flex w-full justify-between gap-[12px] text-[16px] leading-[24px] font-semibold text-[#1e1e1e]">
              <span>Total</span>
              <span>{money(Math.max(0, totals.total - couponOff - pointsOff))}</span>
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
            // A dialog rather than an immediate charge. The cashier has to be
            // able to say what was handed over and add a surcharge before the
            // sale is booked — afterwards it is an insert-only row.
            // Empty where part payment is allowed: the cashier states what
            // was handed over rather than confirming a figure the till put
            // there for them. "Full" fills it in one press.
            //
            // This is only safe because zero now travels as zero — see
            // `totalAmount` in `pay()`. It used to be rewritten to the whole
            // bill on its way out, so confirming an untouched dialog booked a
            // sale as PAID IN FULL against a customer who had handed over
            // nothing.
            setEntry({ ...EMPTY_ENTRY, received: shop.allowPartial ? 0 : openingTender() });
            // The points choice is NOT reset here. It is made in the customer
            // summary, before this button is pressed, and clearing it on the
            // way into the dialog would undo the thing the cashier just agreed
            // with the customer.
            //
            // The last attempt's refusal is not this one's.
            setStatus(null);
            setCashModalOpen(true);
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
            setEntry({ ...EMPTY_ENTRY, received: shop.allowPartial ? 0 : openingTender() });
            setStatus(null);
            setOnlineModalOpen(true);
          }}
          className="flex h-[48px] flex-1 cursor-pointer items-center justify-center rounded-[12px] bg-[#3300bc] hover:bg-[#2c00a3] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && paymentMethod !== "Cash" ? "Processing…" : "Pay Online"}
        </button>
      </div>

      {/* Pay Cash — Figma: the money questions, then the drawer.

          It used to charge the moment the button was pressed. A sale is an
          insert-only row, so anything not asked BEFORE it is booked cannot be
          asked at all: what was handed over, and whether anything was added. */}
      <Modal
        open={cashModalOpen}
        onClose={() => !busy && setCashModalOpen(false)}
        title="Cash payment"
        width={560}
        footer={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCashModalOpen(false)}
              className={MODAL_GHOST}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!cart.length || busy || !entryReady}
              onClick={async () => {
                setPaymentMethod("Cash");
                if (await pay("Cash", undefined, entry)) setCashModalOpen(false);
              }}
              className="flex h-[40px] flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-[#00bc2d] hover:bg-[#00a828] text-[14px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Processing…" : confirmLabel()}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px]">
          {payError}
          <PaymentFields
            subtotal={totals.subtotal}
            tax={totals.tax}
            vatRate={vat !== null ? vatRate : shop.vatRate}
            total={netPayable - Math.max(0, entry.additional || 0)}
            pointsOff={pointsOff}
            couponOff={couponOff}
            couponCode={coupon?.code ?? ""}
            entry={entry}
            onChange={setEntry}
            money={money}
            lockReceived={!partialAvailable}
            lockReason={LOCK_REASON}
            disabled={busy}
          />
        </div>
      </Modal>

      {/* Pay Online Method Modal */}
      <Modal
        open={onlineModalOpen}
        onClose={() => !busy && setOnlineModalOpen(false)}
        title="Pay Online"
        // The same width as the cash dialog. They ask the same questions in the
        // same stacked column, and two payment dialogs that differ only in how
        // wide they are read as two different screens.
        width={560}
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
              disabled={!cart.length || busy || !selectedOnlineMethod || !entryReady}
              onClick={async () => {
                const m = selectedOnlineMethod;
                setPaymentMethod(m);
                if (await pay(m, referenceNo, entry)) setOnlineModalOpen(false);
              }}
              className="flex h-[40px] flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-[#3300bc] hover:bg-[#2c00a3] text-[14px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Processing…" : confirmLabel()}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px] py-[8px]">
          {payError}
          {/* The same four questions the cash dialog asks — one component, so
              the two cannot answer them differently. */}
          <PaymentFields
            subtotal={totals.subtotal}
            tax={totals.tax}
            vatRate={vat !== null ? vatRate : shop.vatRate}
            total={netPayable - Math.max(0, entry.additional || 0)}
            pointsOff={pointsOff}
            couponOff={couponOff}
            couponCode={coupon?.code ?? ""}
            entry={entry}
            onChange={setEntry}
            money={money}
            lockReceived={!partialAvailable}
            lockReason={LOCK_REASON}
            disabled={busy}
          />

          {/* Online Payment Method Options */}
          <div className="flex flex-col gap-[8px]">
            <label htmlFor="pay-method" className="text-[14px] font-medium text-[#1e1e1e]">
              Payment method
              <span aria-hidden className="text-[#c80000]"> *</span>
            </label>
            <select
              id="pay-method"
              required
              disabled={busy}
              value={selectedOnlineMethod}
              onChange={(e) => setSelectedOnlineMethod(e.target.value)}
              className="h-[40px] w-full cursor-pointer rounded-[8px] border border-[#eaeaea] bg-white px-[12px] text-[14px] text-[#1e1e1e] outline-none focus:border-[#3300bc]"
            >
              {onlineMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-[8px]">
            <label htmlFor="pay-ref" className="text-[14px] font-medium text-[#1e1e1e]">
              Transaction / Reference ID
            </label>
            <input
              id="pay-ref"
              type="text"
              disabled={busy}
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g. TrxID or approval code"
              className="h-[40px] w-full rounded-[8px] border border-[#eaeaea] bg-white px-[12px] text-[14px] text-[#1e1e1e] outline-none placeholder:text-[#a3a3a3] focus:border-[#3300bc]"
            />
          </div>

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
              customer={{ name: receipt.customer, phone: receipt.customerPhone }}
              meta={[
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
                { label: "Sub Total:", value: amount(receipt.subtotal) },
                { label: "(-)Discount:", value: amount(receipt.discount) },
                {
                  label: shop.vatIncluded ? "VAT (in price):" : "(+)VAT:",
                  value: amount(receipt.tax),
                },
                {
                  label: "Total Amount:",
                  value: amount(receipt.total),
                  strong: true,
                  ruleAbove: true,
                },
                { label: "Paid by:", value: receipt.method },
                /**
                 * What was TAKEN, and what is still owed.
                 *
                 * "Net Payable" used to print the full total and the status
                 * line below it was the literal string "Paid", on every slip
                 * this till has ever printed. On a part payment that is a
                 * receipt which denies the debt it just created: the customer
                 * holds proof the sale was settled while the account carries
                 * the remainder, and the shop has nothing to chase them with.
                 *
                 * A shop that does not take part payments gets its old slip
                 * back — Paid would be the total restated and Due a zero on
                 * every receipt it prints. A sale carrying a debt keeps the
                 * breakdown whatever the setting says.
                 */
                ...(shop.allowPartial || receipt.due > 0
                  ? [
                      { label: "Paid:", value: amount(receipt.paid), strong: true },
                      // Only when there IS one: "Due: 0" on a settled sale is
                      // a figure the customer has to read and then discount.
                      ...(receipt.due > 0
                        ? [{ label: "Due:", value: amount(receipt.due), strong: true }]
                        : []),
                      { label: "Status:", value: paymentStateOf(receipt.paid, receipt.due) },
                    ]
                  : [
                      { label: "Net Payable:", value: amount(receipt.total), strong: true },
                      { label: "Status:", value: "Paid" },
                    ]),
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
