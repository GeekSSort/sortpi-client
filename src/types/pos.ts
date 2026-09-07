export interface ProductItem {
  /** The VARIANT id. Everything at the till is keyed by it — stock, the cart,
      the sale line — because a variant is what is actually sold. */
  id: string;
  /** The product it belongs to. Needed to address `/products/{id}/...`, which
      is where a discount is set: the catalogue is addressed by product, the
      till by variant, and one screen has to know both. */
  productId: string;
  name: string;
  sku: string;
  /** The primary barcode on the default variant, "" when the product has
      none. What the scanner at the till reads. */
  barcode: string;
  category: "Electronics" | "Groceries" | "Fashion" | "Home & Living";
  price: number;
  priceFormatted: string;
  stock: number;
  image: string;
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
  totalAmount: number;
  /** VAT for this sale as a fraction &mdash; 0.15 is 15%. Left out, the shop's
      own rate applies. Sending one needs the price-override permission. */
  taxRate?: number;
  /** The bKash / card transaction number, when the tender has one. Read by
      `PosService.checkout` — which the type did not admit, so a production
      build failed on six references to a field the runtime has always used. */
  referenceNo?: string;
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
