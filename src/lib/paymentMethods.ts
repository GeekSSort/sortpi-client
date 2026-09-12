/**
 * The non-cash tenders a shop can take, and the one place that knows what
 * each one means.
 *
 * Three screens used to answer this question separately and disagree. Settings
 * offered a free-text box, so "Bkash", "bkash " and "BKASH" were three
 * different methods and a typo silently removed one from the till. The till
 * parsed the same string with its own fallback list. `PosService.checkout`
 * matched substrings to pick the server's `PaymentMethod`, and anything it did
 * not recognise became CARD — a cheque was booked to the card ledger.
 *
 * So the catalogue lives here, the settings screen ticks boxes against it, the
 * till reads it, and `tenderFor` answers the only question the server asks.
 *
 * The stored value stays a comma-separated list of `code`s in the order the
 * shop wants them shown. That is what `pos.online_payment_methods` has always
 * held, so every existing organization keeps working without a migration.
 */

/** What the server records the money under. Cash has its own button at the till. */
export type Tender = "CASH" | "MOBILE" | "BANK" | "CARD" | "OTHER";

export interface PaymentMethodOption {
  /** Stored verbatim, and what the till's button says. */
  code: string;
  /** The settings checkbox, where the code alone is too terse. */
  label: string;
  /** A word under the label, naming the thing rather than the brand. */
  hint: string;
  tender: Tender;
  /**
   * Other spellings that mean this method, lowercased.
   *
   * These are what make the free-text era readable: an organization that saved
   * "Visa/Mastercard" or "bkash" before this screen existed gets its boxes
   * ticked instead of a row of custom methods nobody chose.
   */
  aliases: string[];
}

/**
 * Bangladesh first, because that is who uses this.
 *
 * Order is the order the boxes appear in Settings; the ORDER SAVED is the
 * order the till shows, so a shop that takes mostly bKash can put it first.
 */
export const PAYMENT_METHOD_CATALOGUE: readonly PaymentMethodOption[] = [
  {
    code: "bKash",
    label: "bKash",
    hint: "Mobile banking",
    tender: "MOBILE",
    aliases: ["bkash", "b-kash", "bkash merchant", "bkash personal"],
  },
  {
    code: "Nagad",
    label: "Nagad",
    hint: "Mobile banking",
    tender: "MOBILE",
    aliases: ["nagad", "nogod"],
  },
  {
    code: "Rocket",
    label: "Rocket",
    hint: "Mobile banking",
    tender: "MOBILE",
    aliases: ["rocket", "dbbl rocket", "dbbl mobile banking"],
  },
  {
    code: "Upay",
    label: "Upay",
    hint: "Mobile banking",
    tender: "MOBILE",
    aliases: ["upay", "upay wallet"],
  },
  {
    code: "Card",
    label: "Card (Visa / Mastercard)",
    hint: "Card terminal",
    tender: "CARD",
    aliases: [
      "card",
      "cards",
      "visa",
      "mastercard",
      "master card",
      "visa/mastercard",
      "visa / mastercard",
      "visa/master card",
      "debit card",
      "credit card",
      "pos card",
    ],
  },
  {
    code: "Bank Transfer",
    label: "Bank Transfer",
    hint: "Direct deposit / EFT",
    tender: "BANK",
    aliases: ["bank transfer", "banktransfer", "bank", "wire", "wire transfer", "eft", "neft", "rtgs"],
  },
  {
    code: "Cheque",
    label: "Cheque",
    hint: "Bank cheque",
    tender: "BANK",
    aliases: ["cheque", "check", "bank cheque"],
  },
  {
    code: "Others",
    label: "Others",
    hint: "Anything else",
    tender: "OTHER",
    aliases: ["others", "other", "misc", "miscellaneous"],
  },
];

/**
 * What a shop takes before anybody has said otherwise.
 *
 * Identical to the string registered as the server-side default for
 * `pos.online_payment_methods`, so an organization that never opens Settings
 * sees at the till exactly what it saw before this screen existed.
 */
export const DEFAULT_ONLINE_METHODS: readonly string[] = [
  "Card",
  "bKash",
  "Nagad",
  "Rocket",
  "Bank Transfer",
  "Others",
];

/**
 * How money goes BACK, which is a shorter list than how it comes in.
 *
 * These are the server's own `PaymentMethod` values, not the shop-configured
 * tender names above: a refund names one of them directly. CREDIT and OTHER
 * are absent on purpose — CREDIT is the absence of a payment, so it cannot be
 * refunded as one.
 *
 * Shared because the refund FORM and the refund LIST both need it, and two
 * copies of a four-row list is two copies that can disagree about whether
 * MOBILE says "bKash" or "Mobile banking".
 */
export const REFUND_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "MOBILE", label: "bKash" },
  { value: "BANK", label: "Bank Transfer" },
] as const;

export type RefundMethod = (typeof REFUND_METHODS)[number]["value"];

/** Lowercased spelling -> catalogue entry, built once. */
const BY_SPELLING = new Map<string, PaymentMethodOption>();
for (const option of PAYMENT_METHOD_CATALOGUE) {
  BY_SPELLING.set(option.code.toLowerCase(), option);
  BY_SPELLING.set(option.label.toLowerCase(), option);
  for (const alias of option.aliases) BY_SPELLING.set(alias, option);
}

/** The catalogue entry a stored or typed method means, or null when it is the shop's own. */
export function findPaymentMethod(raw: string): PaymentMethodOption | null {
  return BY_SPELLING.get(raw.trim().toLowerCase()) ?? null;
}

/**
 * A stored method spelled the catalogue's way.
 *
 * A method the catalogue has never heard of is returned trimmed rather than
 * dropped: shops configured one before the boxes existed, and deleting
 * somebody's tender because it is not on our list is not a migration.
 */
export function normalizePaymentMethod(raw: string): string {
  return findPaymentMethod(raw)?.code ?? raw.trim();
}

/**
 * The saved setting -> the methods the till offers, in the saved order.
 *
 * Blank means unset, which means the defaults. A shop that wants NO online
 * tender is a shop that should not be shown a Pay Online button, and the
 * settings screen refuses to save an empty list for that reason.
 */
export function parseOnlineMethods(raw: unknown): string[] {
  const text = typeof raw === "string" ? raw : "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(",")) {
    const method = normalizePaymentMethod(part);
    if (!method) continue;
    const key = method.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(method);
  }
  return out.length > 0 ? out : [...DEFAULT_ONLINE_METHODS];
}

/** The methods a shop takes -> the string the setting holds. */
export function serializeOnlineMethods(methods: readonly string[]): string {
  return methods.map((m) => m.trim()).filter(Boolean).join(", ");
}

/**
 * Which `PaymentMethod` the server should book this tender under.
 *
 * The fallback is OTHER, not CARD. Guessing CARD put every unrecognised
 * tender — a cheque, a shop's own "Due on delivery" — into the card takings,
 * and a reconciliation against the terminal's own report could never balance.
 */
export function tenderFor(method: string): Tender {
  const trimmed = method.trim();
  if (!trimmed) return "CASH";
  if (trimmed.toLowerCase() === "cash") return "CASH";

  const known = findPaymentMethod(trimmed);
  if (known) return known.tender;

  // A shop's own method, matched loosely so "bKash (personal)" still books as
  // mobile banking rather than falling through to OTHER.
  const lowered = trimmed.toLowerCase();
  for (const option of PAYMENT_METHOD_CATALOGUE) {
    for (const spelling of [option.code.toLowerCase(), ...option.aliases]) {
      // Only spellings with some substance: "eft" inside an unrelated word is
      // a coincidence, not a match.
      if (spelling.length >= 4 && lowered.includes(spelling)) return option.tender;
    }
  }
  return "OTHER";
}
