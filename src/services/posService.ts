import {
  ProductItem,
  Customer,
  CheckoutPayload,
  OrderResponse,
  HeldCart,
} from "@/types/pos";
import { apiFetch, apiList, apiListAll, ApiError, tokenStore } from "./apiClient";
import { toProductItem } from "./mappers/product";

export class PosService {
  /**
   * One page of the till's product wall.
   *
   * SERVER-side search and paging. It used to ask for 60 products and filter
   * them in the browser, so on a 514-product catalogue the wall held the first
   * 60 by name and everything after them was unreachable — a cashier searching
   * for a product that plainly exists on the stock screen got "no products".
   *
   * `categoryId`, not a category name: the API filters on the foreign key, and
   * the chip row is built from `/categories/` for the same reason.
   */
  static async getProducts(params?: {
    categoryId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: ProductItem[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.categoryId) query.set("category", params.categoryId);
    if (params?.search) query.set("search", params.search);
    if (params?.page) query.set("page", String(params.page));
    query.set("limit", String(params?.limit ?? 60));

    const [products, stockBySku, categoryNames] = await Promise.all([
      apiList<any>(`/products/?${query.toString()}`, { method: "GET" }, (r) => r),
      PosService.stockOnThisTill(),
      PosService.categoryNames(),
    ]);

    return {
      data: products.data.map((row: any) => toProductItem(row, { stockBySku, categoryNames })),
      total: products.total,
    };
  }

  /**
   * Units on hand in the warehouse this till sells from, by SKU.
   *
   * The selling warehouse and not the branch: summing every warehouse made a
   * tile read "Stock 900" while the shelf here was empty, and the sale was then
   * refused at payment.
   */
  static async stockOnThisTill(): Promise<Map<string, number>> {
    const warehouseId = await sellingWarehouse(await sellingBranch()).catch(() => "");
    const path = warehouseId
      ? `/inventory/stock/?warehouse=${encodeURIComponent(warehouseId)}`
      : "/inventory/stock/";
    const rows = await apiListAll<any>(path, (r) => r).catch(() => [] as any[]);

    const bySku = new Map<string, number>();
    for (const row of rows) {
      const sku = String(row?.sku ?? "");
      if (!sku) continue;
      // Belt and braces: the filter is applied by the API, and a deployment
      // that ignores it must not silently sum two warehouses together.
      if (warehouseId && String(row?.warehouse) !== warehouseId) continue;
      bySku.set(sku, (bySku.get(sku) ?? 0) + Number(row?.available ?? 0));
    }
    return bySku;
  }

  /** Category ids to names — a product names its category by id only. */
  static async categoryNames(): Promise<Map<string, string>> {
    const res = await apiList<any>("/categories/?limit=200", { method: "GET" }, (r) => r).catch(
      () => ({ data: [] as any[] })
    );
    const names = new Map<string, string>();
    for (const c of res.data || []) {
      if (c?.id) names.set(String(c.id), String(c.name ?? ""));
    }
    return names;
  }

  /**
   * The WHOLE catalogue, for the one screen that needs it.
   *
   * The Discounts screen sorts by biggest discount and by stock, which cannot
   * be done a page at a time, so it takes the lot. Every other caller wants
   * `getProducts` — this crawls up to six pages of 200 and is the reason the
   * limit exists.
   */
  static async getAllProducts(): Promise<ProductItem[]> {
    const [rows, stockBySku, categoryNames] = await Promise.all([
      apiListAll<any>("/products/", (r) => r),
      PosService.stockOnThisTill(),
      PosService.categoryNames(),
    ]);
    return rows.map((row: any) => toProductItem(row, { stockBySku, categoryNames }));
  }

  /**
   * The category chips, from the catalogue rather than from whatever happened
   * to be on the current page.
   */
  static async getCategories(): Promise<{ id: string; name: string }[]> {
    const res = await apiList<any>("/categories/?limit=200", { method: "GET" }, (r) => r);
    return (res.data || [])
      .filter((c: any) => c?.id)
      .map((c: any) => ({ id: String(c.id), name: String(c?.name ?? "") }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
  }

  /**
   * Resolve one scanned barcode to a till item.
   *
   * `GET /products/lookup/` rather than a filter over the wall: the wall shows
   * a page at a time and a shop has hundreds of products, so a scan of anything
   * not on screen would read as "no such product". The endpoint is the POS hot
   * path — exact match, cached, and it resolves the branch's price for us.
   *
   * `null` when nothing carries that code. Any other failure is thrown: a
   * cashier needs to know the difference between an unknown barcode and a till
   * that cannot reach the server.
   */
  static async lookupBarcode(barcode: string): Promise<ProductItem | null> {
    const code = barcode.trim();
    if (!code) return null;
    try {
      const found = await apiFetch<any>(
        `/products/lookup/?barcode=${encodeURIComponent(code)}`,
        { method: "GET" }
      );
      // The response names the variant, its product and the resolved price
      // separately. `toProductItem` reads a product row carrying its variants,
      // so the three are put back together here rather than duplicated.
      const variant = { ...(found?.variant ?? {}), price: found?.price, isDefault: true };
      const stockBySku = await PosService.stockOnThisTill().catch(() => new Map<string, number>());
      return toProductItem({ ...(found?.product ?? {}), variants: [variant] }, { stockBySku });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Fetch customer list for POS dropdown
   */
  static async getCustomers(): Promise<Customer[]> {
    const res = await apiList<Customer>(
      "/customers/?limit=100",
      { method: "GET" },
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

    /**
     * The tendered amount, rounded to the money the drawer actually holds.
     *
     * It used to be `String(totalAmount)`, a raw JavaScript float — so a
     * basket that multiplied out to 495.75000000000006 tendered MORE than the
     * sale was worth and the server refused it with PAYMENT_EXCEEDS_TOTAL. The
     * cashier saw "Payment failed. Try again." and trying again failed the
     * same way, because the arithmetic was the same every time.
     */
    const tendered = Number(payload.totalAmount).toFixed(2);

    const post = (amount: string) =>
      apiFetch<any>("/sales/", {
        method: "POST",
        // One key per attempt: a retry after a timeout must not ring twice.
        idempotencyKey: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        body: buildBody(amount),
      });

    const buildBody = (amount: string) =>
      JSON.stringify({
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
            payment_method: (() => {
              const m = String(payload.paymentMethod || "Cash").toLowerCase();
              if (m === "cash") return "CASH";
              if (m.includes("bkash") || m.includes("nagad") || m.includes("rocket") || m.includes("mobile") || m.includes("upay")) {
                return "MOBILE";
              }
              if (m.includes("bank") || m.includes("transfer") || m.includes("wire")) {
                return "BANK";
              }
              return "CARD";
            })(),
            payment_provider: String(payload.paymentMethod || "Cash"),
            ...(payload.referenceNo && payload.referenceNo.trim()
              ? { reference_no: payload.referenceNo.trim() }
              : {}),
            // The server has already priced the basket; this is what was
            // tendered against it.
            amount,
          },
        ],
        ...(payload.referenceNo && payload.referenceNo.trim()
          ? { note: `Txn: ${payload.referenceNo.trim()}` }
          : {}),
      });

    let sale: any;
    try {
      sale = await post(tendered);
    } catch (error) {
      /**
       * The server is the pricing authority, so when its total disagrees with
       * the till's, the server is right and the till pays what it says.
       *
       * The refusal carries `grand_total`, which is the exact figure this sale
       * is worth — so one retry with that number settles it instead of
       * handing the cashier an error they cannot act on. A customer with
       * wholesale pricing, a rounding rule the till does not model, a rate
       * changed in Settings since the page loaded: all of them land here, and
       * all of them are the same fix.
       */
      const detail = error instanceof ApiError ? (error.errors as { grand_total?: string }) : null;
      if (
        error instanceof ApiError &&
        error.code === "PAYMENT_EXCEEDS_TOTAL" &&
        detail?.grand_total
      ) {
        sale = await post(Number(detail.grand_total).toFixed(2));
      } else {
        throw error;
      }
    }

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
    // `branch` is REQUIRED by HeldCartSerializer. Sent conditionally, a till
    // with no active branch got a bare "Validation failed" from the server
    // instead of being told the one thing it could act on.
    if (!branchId) {
      throw new ApiError(
        0,
        "NO_ACTIVE_BRANCH",
        "This till is not in a branch yet. Pick one from the header before holding a cart."
      );
    }
    await apiFetch("/pos/hold/", {
      method: "POST",
      body: JSON.stringify({
        reference: `HOLD-${Date.now().toString().slice(-8)}`,
        branch: branchId,
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
 * The branch this till is selling for, or "" when the server has not said.
 *
 * `tokenStore.branch()` mirrors the ACTIVE branch `/auth/me` reported, which is
 * the same cursor `scope_to_branches` narrows every other screen by — so while
 * it is set, the till, the stock screen and the products table are all looking
 * at one branch.
 *
 * It used to fall back to `BranchService.list()[0]`, and that list is ordered by
 * CODE. For a user the server had put in no branch at all, the till therefore
 * sold off whichever branch sorted first alphabetically — Chattogram, in a shop
 * whose other two branches are Dhaka and Head Office — while the stock screen
 * and the products table showed every branch the user could see. Three screens,
 * three different answers about the same shelf.
 *
 * "" now means "scoped the way the server scopes everything else", which is at
 * least an answer the rest of the app agrees with. The real fix for a till that
 * does not know where it is standing is to pick a branch: the POS header
 * carries the switcher.
 */
async function sellingBranch(): Promise<string> {
  return tokenStore.branch() ?? "";
}

/** That branch's main warehouse — the shelf the till sells off. */
async function sellingWarehouse(branchId: string): Promise<string> {
  // No branch, no shelf. `/warehouses/` lists every branch the caller can
  // reach, so falling through to "the first MAIN in the list" would sell off
  // whichever branch sorted first — the same guess `sellingBranch` used to
  // make, one level down. A till that does not know where it is standing has
  // to be told, not to improvise.
  if (!branchId) {
    throw new ApiError(
      0,
      "NO_ACTIVE_BRANCH",
      "This till is not in a branch yet. Pick one from the header first."
    );
  }
  const rows = await apiList<any>("/warehouses/?limit=100", { method: "GET" }, (r) => r);
  const here = rows.data.filter((w: any) => String(w?.branch) === branchId);
  const main = here.find((w: any) => String(w?.type ?? w?.warehouseType) === "MAIN");
  const chosen = main ?? here[0];
  if (!chosen?.id) {
    throw new ApiError(0, "NO_WAREHOUSE", "This branch has no warehouse to sell from.");
  }
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
