export interface ProductItem {
  /** The VARIANT id. Everything at the till is keyed by it — stock, the cart,
      the sale line — because a variant is what is actually sold. */
  id: string;
  /** The product it belongs to. Needed to address `/products/{id}/...`, which
      is where a discount is set: the catalogue is addressed by product, the
      till by variant, and one screen has to know both. */
  productId: string;
  name: string;
  /**
   * Which variant of that product this is — "500ml", "Red / Large".
   *
   * EMPTY for a product that has only the one unnamed variant, which is most
   * of them: a shop selling loose rice has a single variant the API calls
   * "Default", and printing that on a tile would be noise on every tile in
   * the shop. Non-empty is the signal to show it.
   */
  variantLabel: string;
  /** `name` and `variantLabel` as one string, for a receipt or a search. */
  fullName: string;
  sku: string;
  /** The primary barcode on the default variant, "" when the product has
      none. What the scanner at the till reads. */
  barcode: string;
  category: "Electronics" | "Groceries" | "Fashion" | "Home & Living";
  price: number;
  priceFormatted: string;
  stock: number;
  image: string;
  /** What this is sold in — "pcs", "m", "kg". Shown beside the quantity. */
  unitShort: string;
  /**
   * Whether a fraction of it can be sold.
   *
   * `UnitService.validate_quantity` has always refused 2.5 pieces; the till
   * just had no way to know before it asked. Half a metre of cloth is fine,
   * half a bottle is not, and the box on screen now allows exactly what the
   * server would accept.
   */
  allowDecimal: boolean;
  /**
   * What the SERVER will tax this line at — the product's own rate, or the
   * shop's default where it has none, already resolved.
   *
   * A fraction: 0.15 is 15%. Undefined only for a payload from a server that
   * predates the field, in which case the till falls back to the shop setting
   * as it always did.
   */
  taxRate?: number;
  /** Whether `taxRate` is already inside `price` (BD retail) or added on top. */
  taxInclusive?: boolean;
}

export type ProductCategory = "All Categories" | "Electronics" | "Groceries" | "Fashion" | "Home & Living";

export interface CartItem {
  product: ProductItem;
  quantity: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  type: "Walk-in" | "Regular" | "VIP" | "Premium";
  /**
   * Points in this customer's wallet.
   *
   * 0 for a walk-in, who has no wallet to put them in — and 0 in a shop that
   * runs no scheme, which is what makes the till's points panel absent rather
   * than empty.
   */
  loyaltyPoints: number;
}

export interface OrderCalculation {
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
  total: number;
}

export interface CheckoutPayload {
  customerId: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
  paymentMethod: "Cash" | "Online" | "bKash" | "Card" | string;
  discountAmount: number;
  /** What the customer handed over. Less than `payableAmount` is a part
      payment; the remainder goes on their account. */
  totalAmount: number;
  /** The bill this tender is measured against, surcharge included. Never sent
      to the server as a total — the server prices the sale itself — it only
      tells `checkout` whether a short tender was deliberate. */
  payableAmount?: number;
  /** A surcharge the cashier added at the till, and why. The server decides
      what it does to the tax, per `pos.surcharge_taxable`. */
  extraChargeAmount?: number;
  extraChargeReason?: string;
  /** VAT for this sale as a fraction &mdash; 0.15 is 15%. Left out, the shop's
      own rate applies. Sending one needs the price-override permission. */
  taxRate?: number;
  /** The bKash / card transaction number, when the tender has one. Read by
      `PosService.checkout` — which the type did not admit, so a production
      build failed on six references to a field the runtime has always used. */
  referenceNo?: string;
  /**
   * Points the customer is spending on this sale — an INPUT, not a discount.
   *
   * The server reads the shop's rules and the customer's real balance and
   * works out what they are worth. Sending the money instead would let a till
   * set its own exchange rate.
   */
  redeemPoints?: number;
  /**
   * A coupon code typed at the till. The CODE, never a figure.
   *
   * The server resolves it against the coupon row and prices the sale from
   * that. The till asks `POST /coupons/check/` first so the cashier can see
   * the answer, but what is charged is decided server-side.
   */
  couponCode?: string;
  /**
   * The `Idempotency-Key` this checkout is spent under.
   *
   * Belongs to the CART, not to the request: it has to be identical across a
   * double-tap on PAY and across a retry after a timeout, or the server rings
   * the sale twice. The till mints one per cart and drops it once a sale comes
   * back. Omitted, `checkout` derives one, which still covers the two attempts
   * it makes internally.
   */
  idempotencyKey?: string;
}

/** A cart parked at the till, waiting for the customer to come back. */
export interface HeldCart {
  id: string;
  reference: string;
  customerName: string;
  cashierName: string;
  items: {
    productId: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    /** What the shelf held when it was parked, so the tile reads right again. */
    stock?: number;
  }[];
  at: string;
}

export interface OrderResponse {
  success: boolean;
  orderId: string;
  invoiceNo: string;
  message: string;
  timestamp: string;
  /**
   * What the SERVER priced this sale at, in its own words.
   *
   * The server is the pricing authority — it re-prices every line from
   * `PriceService` and works the totals out itself — and when its figure
   * differs from the till's, the till pays the server's. The receipt was still
   * built from the till's own arithmetic, so a customer could be handed a slip
   * whose subtotal, discount and total were not the ones in the books. These
   * are the ones to print.
   */
  totals?: {
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
    paid: number;
    due: number;
  };
}
