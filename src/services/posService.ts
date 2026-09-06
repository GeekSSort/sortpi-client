import {
  ProductItem,
  ProductCategory,
  Customer,
  CheckoutPayload,
  OrderResponse,
  HeldCart,
} from "@/types/pos";
import { initialProductCatalog } from "@/lib/mock-pos-data";
import { apiFetch, apiList, apiListAll, ApiError, tokenStore } from "./apiClient";
import { BranchService } from "./branchService";
import { toProductItem } from "./mappers/product";

const fallbackCustomers: Customer[] = [
  { id: "cust-1", name: "Walk-in Customer", type: "Walk-in" },
  { id: "cust-2", name: "Rahim Uddin", phone: "+880 1712 345 678", type: "VIP" },
  { id: "cust-3", name: "Karim Ahmed", phone: "+880 1812 456 789", type: "Regular" },
  { id: "cust-4", name: "Tanvir Hasan", phone: "+880 1912 567 890", type: "Premium" },
];

export class PosService {
  /**
   * Fetch POS catalog products with optional category and search filters
   */
  static async getProducts(category?: ProductCategory, search?: string): Promise<ProductItem[]> {
    const fallback = () => {
      let filtered = [...initialProductCatalog];
      if (category && category !== "All Categories") {
        filtered = filtered.filter((p) => p.category === category);
      }
      if (search && search.trim() !== "") {
        const query = search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query)
        );
      }
      return filtered;
    };

    const params = new URLSearchParams();
    if (category && category !== "All Categories") params.set("category", category);
    if (search) params.set("search", search);
    params.set("limit", "60");
    const queryString = `?${params.toString()}`;

    // Two calls, because the catalogue and the stock ledger are separate
    // resources: a product says what it is, `/inventory/stock/` says how many
    // are on the shelf. Joined here on SKU so the tile can show both.
    const [products, stock, categories] = await Promise.all([
      apiList<any>(`/products/${queryString}`, { method: "GET" }, undefined, (r) => r),
      // Every page: 200 rows at most, and a SKU we miss reads as sold out.
      apiListAll<any>("/inventory/stock/", (r) => r).catch(() => [] as any[]),
      // A product names its category by id only, so the tiles would read as
      // UUIDs and the category filter would match nothing.
      apiList<any>("/categories/?limit=100", { method: "GET" }, undefined, (r) => r).catch(
        () => ({ data: [] as any[] })
      ),
    ]);

    if (!products?.data?.length) return fallback();

    // Only the warehouse this till sells from. Summing every branch made a
    // tile read "Stock 900" while the shelf here was empty, and the sale was
    // then refused at payment.
    const warehouseId = await sellingWarehouse(await sellingBranch()).catch(() => "");
    const stockBySku = new Map<string, number>();
    for (const row of stock || []) {
      const sku = String(row?.sku ?? "");
      if (!sku) continue;
      if (warehouseId && String(row?.warehouse) !== warehouseId) continue;
      stockBySku.set(sku, (stockBySku.get(sku) ?? 0) + Number(row?.available ?? 0));
    }

    const categoryNames = new Map<string, string>();
    for (const c of categories.data || []) {
      if (c?.id) categoryNames.set(String(c.id), String(c.name ?? ""));
    }

    return products.data.map((row: any) => toProductItem(row, { stockBySku, categoryNames }));
  }

  /**
   * Fetch customer list for POS dropdown
   */
  static async getCustomers(): Promise<Customer[]> {
    const res = await apiList<Customer>(
      "/customers/?limit=100",
      { method: "GET" },
      { data: fallbackCustomers, total: fallbackCustomers.length },
      (row: any) => ({
        id: String(row?.id ?? ""),
        name: String(row?.name ?? ""),
        phone: row?.phone || undefined,
        type: (String(row?.customerType || "").toUpperCase() === "VIP"
          ? "VIP"
          : "Regular") as Customer["type"],
      })
    );

    // A till always needs a way to sell to somebody who is not on file.
    return [{ id: "", name: "Walk-in Customer", type: "Walk-in" }, ...res.data];
  }

  /**
   * Ring the sale.
   *
   * The old body was refused outright &mdash; a receipt printed and nothing was
   * saved. `POST /sales/` wants `customer_id`, `warehouse_id`, and lines by
   * `variant_id`; the POS was sending `customerId` and `productId`, with no
   * warehouse at all.
   *
   * It also carries NO prices. The server prices the basket itself, so a total
   * sent from here would be ignored at best. The figures on screen are what the
   * shopper is told; the figures in the sale are the server's.
   *
   * Three things have to be true before it will take a sale, and all three are
   * arranged here: a warehouse to sell out of, a customer to sell to, and an
   * open shift to sell in.
   */
  static async checkout(payload: CheckoutPayload): Promise<OrderResponse> {
    const branchId = await sellingBranch();
    const [warehouseId, customerId, shiftId] = await Promise.all([
      sellingWarehouse(branchId),
      payload.customerId && payload.customerId !== "walk-in"
        ? Promise.resolve(payload.customerId)
        : walkInCustomer(),
      openShift(),
    ]);

    const sale = await apiFetch<any>("/sales/", {
      method: "POST",
      // One key per attempt: a retry after a timeout must not ring twice.
      idempotencyKey: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      body: JSON.stringify({
        customer_id: customerId,
        warehouse_id: warehouseId,
        // Required whenever the cashier works in more than one branch, and the
        // warehouse has to belong to it.
        ...(branchId ? { branch_id: branchId } : {}),
        ...(shiftId ? { shift_id: shiftId } : {}),
        items: payload.items.map((i) => ({
          // A tile's id IS the variant id; the server sells variants, not
          // products.
          variant_id: i.productId,
          quantity: i.quantity,
        })),
        // What the customer is taking off the bill. The server applies it and
        // works out every figure itself, and refuses one worth more than the
        // sale &mdash; until this was sent, the screen showed a discount that
        // never reached the books.
        ...(payload.discountAmount > 0
          ? { discount_amount: payload.discountAmount.toFixed(2) }
          : {}),
        // Only when the cashier has changed it. Sending the shop's usual rate
        // on every sale would need a permission most cashiers do not hold.
        ...(payload.taxRate != null ? { tax_rate: payload.taxRate.toFixed(4) } : {}),
        payments: [
          {
            payment_method: payload.paymentMethod === "Cash" ? "CASH" : "CARD",
            // The server has already priced the basket; this is what was
            // tendered against it.
            amount: String(payload.totalAmount),
          },
        ],
      }),
    });

    return {
      success: true,
      orderId: String(sale?.id ?? ""),
      invoiceNo: String(sale?.invoiceNumber ?? sale?.invoice_number ?? ""),
      message: "Sale recorded.",
      timestamp: String(sale?.saleDate ?? sale?.sale_date ?? new Date().toISOString()),
    };
  }

  /**
   * Park the cart and clear the till.
   *
   * Kept on the server, not in this browser: the customer who walked off to
   * fetch their wallet may come back to a different till, and a supervisor may
   * need to see what is parked.
   */
  static async holdCart(items: HeldCart["items"], customerId?: string): Promise<void> {
    const branchId = await sellingBranch();
    await apiFetch("/pos/hold/", {
      method: "POST",
      body: JSON.stringify({
        reference: `HOLD-${Date.now().toString().slice(-8)}`,
        ...(branchId ? { branch: branchId } : {}),
        ...(customerId ? { customer: customerId } : {}),
        cart_data: { items },
      }),
    });
  }

  /** Everything parked at this branch. */
  static async heldCarts(): Promise<HeldCart[]> {
    const rows = await apiList<any>(
      "/pos/held/?limit=50",
      { method: "GET" },
      { data: [], total: 0 },
      (r) => r
    );
    return (rows.data || []).map((row: any) => ({
      id: String(row?.id ?? ""),
      reference: String(row?.reference ?? ""),
      customerName: String(row?.customerName ?? row?.customer_name ?? "") || "Walk-in Customer",
      cashierName: String(row?.cashierName ?? row?.cashier_name ?? ""),
      items: heldItems(row?.cartData?.items ?? row?.cart_data?.items),
      at: String(row?.createdAt ?? row?.created_at ?? ""),
    }));
  }

  /**
   * Take a parked cart back.
   *
   * The server hands it over and deletes it in the same call, so two tills
   * cannot resume the same cart and sell the stock twice.
   */
  static async resumeCart(id: string): Promise<HeldCart["items"]> {
    const row = await apiFetch<any>(`/pos/held/${id}/resume/`, { method: "POST" });
    return heldItems(row?.cartData?.items ?? row?.cart_data?.items);
  }

  /** Throw a parked cart away. */
  static async dropHeldCart(id: string): Promise<void> {
    await apiFetch(`/pos/held/${id}/`, { method: "DELETE" });
  }

  /**
   * Alias for checkout
   */
  static async createOrder(payload: CheckoutPayload): Promise<OrderResponse> {
    return this.checkout(payload);
  }
}

/** The lines of a parked cart, however the envelope named its keys. */
function heldItems(rows: any): HeldCart["items"] {
  return (rows ?? []).map((i: any) => ({
    productId: String(i?.productId ?? i?.product_id ?? ""),
    name: String(i?.name ?? ""),
    sku: String(i?.sku ?? ""),
    price: Number(i?.price ?? 0),
    quantity: Number(i?.quantity ?? 0),
    stock: Number(i?.stock ?? 0),
  }));
}

/**
 * The branch this till is selling for.
 *
 * The branch the person switched to, if they picked one; otherwise the first
 * they are assigned to. A cashier in one branch never has to choose.
 */
async function sellingBranch(): Promise<string> {
  const stored = tokenStore.branch();
  if (stored) return stored;
  const branches = await BranchService.list().catch(() => []);
  return branches[0]?.id ?? "";
}

/** That branch's main warehouse — the shelf the till sells off. */
async function sellingWarehouse(branchId: string): Promise<string> {
  const rows = await apiList<any>(
    "/warehouses/?limit=100",
    { method: "GET" },
    { data: [], total: 0 },
    (r) => r
  );
  const here = rows.data.filter((w: any) => !branchId || String(w?.branch) === branchId);
  const main = here.find((w: any) => String(w?.type ?? w?.warehouseType) === "MAIN");
  const chosen = main ?? here[0] ?? rows.data[0];
  if (!chosen?.id) throw new ApiError(0, "NO_WAREHOUSE", "This branch has no warehouse to sell from.");
  return String(chosen.id);
}

/**
 * Somebody to sell to.
 *
 * The API requires a customer on every sale, so a walk-in needs a real record.
 * One is kept for the purpose and made the first time it is needed. A nullable
 * customer on the sale would be the better answer, and it is in the report.
 */
async function walkInCustomer(): Promise<string> {
  const rows = await apiList<any>(
    "/customers/?limit=500",
    { method: "GET" },
    { data: [], total: 0 },
    (r) => r
  );
  const found = rows.data.find((c: any) => String(c?.name ?? "").toLowerCase() === "walk-in customer");
  if (found?.id) return String(found.id);

  const made = await apiFetch<any>("/customers/", {
    method: "POST",
    body: JSON.stringify({
      code: "CUS-WALKIN",
      name: "Walk-in Customer",
      phone: "",
      customer_type: "RETAIL",
    }),
  });
  return String(made?.id ?? "");
}

/**
 * The cashier's open drawer.
 *
 * A sale belongs to a shift. If this cashier has none open, one is opened on
 * the branch they are working in, which is what walking up to a till does.
 */
async function openShift(): Promise<string | null> {
  try {
    const current = await apiFetch<any>("/pos/shifts/current/", { method: "GET" });
    if (current?.id) return String(current.id);
  } catch {
    // No open shift is a normal state, not a failure.
  }

  const branchId = await sellingBranch();
  if (!branchId) return null;

  try {
    const shift = await apiFetch<any>("/pos/shifts/open/", {
      method: "POST",
      body: JSON.stringify({ branch_id: branchId, opening_cash: "0" }),
    });
    return shift?.id ? String(shift.id) : null;
  } catch {
    // Let the sale try anyway: the server finds an open shift on its own when
    // the cashier already has exactly one.
    return null;
  }
}
