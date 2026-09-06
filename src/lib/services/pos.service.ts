import { ProductItem, Customer, CheckoutPayload, OrderResponse } from "@/types/pos";
import { initialProductCatalog } from "@/lib/mock-pos-data";

/** Sample POS data, used when there is no API to call. */
export class PosService {
  private static baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

  /** Products, with optional search and category filter. */
  static async getProducts(params?: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ products: ProductItem[]; total: number }> {
    // In production:
    // const res = await fetch(`${this.baseUrl}/pos/products?...`);
    // return res.json();
    return Promise.resolve({
      products: initialProductCatalog,
      total: initialProductCatalog.length,
    });
  }

  /** Find customers by name or phone. */
  static async searchCustomers(query: string): Promise<Customer[]> {
    const mockCustomers: Customer[] = [
      { id: "cus-1", name: "Walk-in Customer", type: "Walk-in" },
      { id: "cus-2", name: "Rahim Uddin", phone: "+880 1712-456 890", type: "VIP" },
      { id: "cus-3", name: "Karim Ahmed", phone: "+880 1819-123 456", type: "Regular" },
      { id: "cus-4", name: "Tanvir Hasan", phone: "+880 1911-789 012", type: "Premium" },
    ];

    if (!query) return Promise.resolve(mockCustomers);
    return Promise.resolve(
      mockCustomers.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.phone?.includes(query)
      )
    );
  }

  /** Send a finished sale to the server. */
  static async createOrder(payload: CheckoutPayload): Promise<OrderResponse> {
    // In production:
    // const res = await fetch(`${this.baseUrl}/pos/orders`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload),
    // });
    // return res.json();

    return Promise.resolve({
      success: true,
      orderId: `ord-${Date.now()}`,
      invoiceNo: `INV-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      message: "Order placed successfully",
      timestamp: new Date().toISOString(),
    });
  }

  /** Park a cart to come back to later. */
  static async holdOrder(payload: CheckoutPayload): Promise<{ success: boolean; holdId: string }> {
    return Promise.resolve({
      success: true,
      holdId: `hold-${Date.now()}`,
    });
  }
}

