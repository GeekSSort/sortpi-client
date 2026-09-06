export interface ProductItem {
  id: string;
  name: string;
  sku: string;
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
  paymentMethod: "Cash" | "Online" | "bKash" | "Card";
  discountCode?: string;
  discountAmount: number;
  totalAmount: number;
  /** VAT for this sale as a fraction &mdash; 0.15 is 15%. Left out, the shop's
      own rate applies. Sending one needs the price-override permission. */
  taxRate?: number;
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
}
