import {
  ProductItem,
  Customer,
  CartItem,
  CheckoutPayload,
  OrderResponse,
  HeldCart,
} from "@/types/pos";
import { apiFetch, apiList, apiListAll, ApiError, toAmount, tokenStore } from "./apiClient";
import { toProductItem, toProductItems } from "./mappers/product";
import { tenderFor } from "@/lib/paymentMethods";

/**
 * A way of grouping the wall — one category, or one brand.
 *
 * The two are the same shape on purpose: the till renders them with the same
 * card and the same chooser, and the only difference is which id the products
 * query is then filtered by.
 */
export interface PosGrouping {
  id: string;
  name: string;
  /** How many products sit under it. Annotated server-side. */
  productCount: number;
  /** `image_url` for a category, `logo_url` for a brand. Usually unset. */
  image: string | null;
  description: string | null;
}

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
    brandId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: ProductItem[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.categoryId) query.set("category", params.categoryId);
    if (params?.brandId) query.set("brand", params.brandId);
    if (params?.search) query.set("search", params.search);
    if (params?.page) query.set("page", String(params.page));
    query.set("limit", String(params?.limit ?? 60));

    const [products, stockBySku, categoryNames] = await Promise.all([
      apiList<any>(`/products/?${query.toString()}`, { method: "GET" }, (r) => r),
      PosService.stockOnThisTill(),
      PosService.categoryNames(),
    ]);

    /**
     * One tile per VARIANT, not per product.
     *
     * `total` stays the server's PRODUCT count, deliberately: it is what the
     * pager pages through, and reporting the expanded tile count would make
     * the last page arrive early and leave rows unreachable. The two figures
     * differing is the honest description of a page of products that expands
     * into more tiles than it has rows.
     */
    return {
      data: products.data.flatMap((row: any) =>
        toProductItems(row, { stockBySku, categoryNames })
      ),
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
    return rows.flatMap((row: any) => toProductItems(row, { stockBySku, categoryNames }));
  }

  /**
   * The category chips, from the catalogue rather than from whatever happened
   * to be on the current page.
   */
  static async getCategories(): Promise<PosGrouping[]> {
    const res = await apiList<any>("/categories/?limit=200", { method: "GET" }, (r) => r);
    return (res.data || [])
      .filter((c: any) => c?.id)
      .map((c: any) => ({
        id: String(c.id),
        name: String(c?.name ?? ""),
        productCount: Number(c?.productCount ?? 0),
        image: String(c?.imageUrl ?? "") || null,
        description: String(c?.description ?? "") || null,
      }))
      .sort((a: PosGrouping, b: PosGrouping) => a.name.localeCompare(b.name));
  }

  /**
   * The brands, for the Brand list behind the toolbar's button.
   *
   * Same shape and same reasoning as `getCategories`: read from the catalogue
   * rather than from the products on the current page, or a brand whose stock
   * happens to sit on page four would simply not exist as far as the till is
   * concerned.
   */
  static async getBrands(): Promise<PosGrouping[]> {
    const res = await apiList<any>("/brands/?limit=200", { method: "GET" }, (r) => r);
    return (res.data || [])
      .filter((b: any) => b?.id)
      .map((b: any) => ({
        id: String(b.id),
        name: String(b?.name ?? ""),
        productCount: Number(b?.productCount ?? 0),
        image: String(b?.logoUrl ?? "") || null,
        description: null,
      }))
      .sort((a: PosGrouping, b: PosGrouping) => a.name.localeCompare(b.name));
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
  /**
   * A scanned code -> the product, as fast as the network allows.
   *
   * This is the hot path of the whole till, and it used to cost up to NINE
   * round-trips, chained one after another:
   *
   *     lookup the barcode
   *       -> then sellingBranch()
   *         -> then sellingWarehouse()
   *           -> then the ENTIRE stock list, up to six pages of 200 rows
   *
   * — all of it to learn the stock figure for ONE sku, all of it serial, and
   * all of it on every single scan. A cashier scanning a queue through watched
   * each item appear a beat after the beep, which is the difference between a
   * till that feels like a tool and one that feels broken.
   *
   * Two changes, and both are about the shape rather than the speed of any one
   * request:
   *
   *   * the stock figure comes from `/inventory/stock/?variant=…&limit=1`,
   *     which is ONE row, not the whole warehouse;
   *   * it is fetched in PARALLEL with the barcode lookup rather than after
   *     it, because neither answer depends on the other.
   *
   * A scan is therefore one round-trip's worth of waiting, and a repeat scan of
   * something already on the wall or already in the basket never leaves the
   * browser at all — see `ProductGrid.submitScan`.
   *
   * The warehouse id is resolved once per session and remembered, because it
   * cannot change without the cashier switching branch, and switching branch
   * reloads the till.
   */
  static async lookupBarcode(barcode: string): Promise<ProductItem | null> {
    const code = barcode.trim();
    if (!code) return null;
    try {
      const warehousePromise = PosService.sellingWarehouseId();
      const found = await apiFetch<any>(
        `/products/lookup/?barcode=${encodeURIComponent(code)}`,
        { method: "GET" }
      );
      // The response names the variant, its product and the resolved price
      // separately. `toProductItem` reads a product row carrying its variants,
      // so the three are put back together here rather than duplicated.
      const variant = { ...(found?.variant ?? {}), price: found?.price, isDefault: true };

      // One row, for the one sku that was scanned. `available`, not
      // `quantity`: the tile has to show what can be SOLD, and a reserved unit
      // is not that.
      const warehouseId = await warehousePromise;
      const stockBySku = new Map<string, number>();
      if (warehouseId && variant?.id) {
        const rows = await apiList<any>(
          `/inventory/stock/?variant=${encodeURIComponent(String(variant.id))}` +
            `&warehouse=${encodeURIComponent(warehouseId)}&limit=1`,
          { method: "GET" },
          (r) => r
        ).catch(() => ({ data: [] as any[] }));
        const row = rows.data[0];
        if (row && String(row?.sku ?? "")) {
          stockBySku.set(String(row.sku), Number(row?.available ?? 0));
        }
      }
      return toProductItem({ ...(found?.product ?? {}), variants: [variant] }, { stockBySku });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * The warehouse this till sells from, resolved once.
   *
   * Two requests — the branch, then its warehouse — and neither can change
   * without the cashier switching branch, which reloads the till. Resolving
   * them on every scan was two thirds of the round-trips a scan used to make.
   *
   * The in-flight promise is what is cached, not the answer, so ten scans in
   * the first second share one resolution instead of starting ten.
   */
  private static warehouseIdPromise: Promise<string> | null = null;

  static sellingWarehouseId(): Promise<string> {
    if (!PosService.warehouseIdPromise) {
      PosService.warehouseIdPromise = (async () => {
        try {
          return await sellingWarehouse(await sellingBranch());
        } catch {
          // Unknown means "do not claim a stock figure", which the caller
          // handles: a tile with no stock badge is honest, a wrong one is not.
          PosService.warehouseIdPromise = null;
          return "";
        }
      })();
    }
    return PosService.warehouseIdPromise;
  }

  /** Forget the remembered warehouse — called when the branch changes. */
  static forgetSellingWarehouse(): void {
    PosService.warehouseIdPromise = null;
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
        // The wallet, so the payment dialog can show it without a second
        // request per customer the cashier scrolls past.
        loyaltyPoints: Number(row?.loyaltyPoints ?? row?.loyalty_points ?? 0) || 0,
      })
    );

    // A till always needs a way to sell to somebody who is not on file.
    return [
      { id: "", name: "Walk-in Customer", type: "Walk-in", loyaltyPoints: 0 },
      ...res.data,
    ];
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

    /**
     * One key for this CHECKOUT, not one per HTTP attempt.
     *
     * It used to be minted inside `post()`, so every attempt carried a
     * different key and the server's at-most-once guarantee was inert: a
     * double-tap on PAY, a retry after a timeout, or a re-mounted panel each
     * rang the sale again, and the second one is a real duplicate — a second
     * invoice, a second stock movement, a second row in the drawer.
     *
     * `checkoutKey` is handed in by the till and survives every attempt for
     * the same cart; it is only replaced once a sale comes back. Without one
     * a key is derived here, which still covers the two attempts this method
     * makes on its own.
     */
    const key =
      payload.idempotencyKey ||
      `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const post = (amount: string) =>
      apiFetch<any>("/sales/", {
        method: "POST",
        idempotencyKey: key,
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
        // Points the customer is spending, and any coupon code they handed
        // over. BOTH are inputs the server prices for itself.
        //
        // Neither was forwarded. The till computed a points discount, showed
        // it, tendered the reduced figure — and sent no `redeem_points`, so
        // the server priced the sale at full value and refused the tender as
        // short, or booked the difference as a debt. A field this function
        // does not name is a field that does not exist, however carefully the
        // screen above it was built.
        ...(payload.redeemPoints && payload.redeemPoints > 0
          ? { redeem_points: Math.floor(payload.redeemPoints) }
          : {}),
        ...(payload.couponCode && payload.couponCode.trim()
          ? { coupon_code: payload.couponCode.trim() }
          : {}),
        // A surcharge and its reason. Inputs, not totals: the server works out
        // what they do to the tax and to the grand total.
        ...(payload.extraChargeAmount && payload.extraChargeAmount > 0
          ? {
              extra_charge_amount: payload.extraChargeAmount.toFixed(2),
              extra_charge_reason: (payload.extraChargeReason || "").trim(),
            }
          : {}),
        /**
         * No money, no payment row.
         *
         * The server refuses a payment of zero outright —
         * INVALID_PAYMENT_AMOUNT, "A payment must be positive" — because a
         * zero tender is not a payment, it is the absence of one. A sale with
         * NO payments is the supported way to say that: the whole grand total
         * becomes `due_amount`, the customer's credit limit is checked, and
         * the sale lands as Unpaid.
         *
         * So an empty array here is not an edge case to guard against, it is
         * the body for a sale taken entirely on account.
         */
        payments:
          Number(amount) > 0
            ? [
                {
                  // Which ledger the money lands in. The brand the cashier
                  // picked rides along in `payment_provider`; this is the
                  // server's coarse `PaymentMethod`, and the mapping is the
                  // catalogue's — it used to be a substring ladder here that
                  // ended in `return "CARD"`, so a cheque and every
                  // shop-defined tender were booked as card takings and no
                  // reconciliation against the terminal could balance.
                  payment_method: tenderFor(String(payload.paymentMethod || "Cash")),
                  payment_provider: String(payload.paymentMethod || "Cash"),
                  ...(payload.referenceNo && payload.referenceNo.trim()
                    ? { reference_no: payload.referenceNo.trim() }
                    : {}),
                  // The server has already priced the basket; this is what was
                  // tendered against it.
                  amount,
                },
              ]
            : [],
        ...(payload.referenceNo && payload.referenceNo.trim()
          ? { note: `Txn: ${payload.referenceNo.trim()}` }
          : {}),
      });

    /**
     * Was this tender short ON PURPOSE?
     *
     * The recovery below re-posts at the server's own grand total whenever a
     * tender is refused for exceeding it. That is right for a rounding
     * disagreement and WRONG for a part payment: it would quietly charge the
     * customer the whole bill after the cashier had taken a deposit. A tender
     * below what the till believes is payable is deliberate, and is left
     * alone.
     */
    const partial =
      payload.payableAmount != null &&
      Number(payload.totalAmount) < Number(payload.payableAmount) - 0.005;

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
      /**
       * BOTH spellings, and deliberately so.
       *
       * `apiClient` used to run `snakeToCamelCase` over the ENTIRE body — it
       * cannot tell a field name from a map key — so the server's
       * `errors.grand_total` arrived here as `errors.grandTotal`. This read
       * only the snake_case name, so `detail?.grand_total` was always
       * undefined and the whole re-price retry below was DEAD CODE: a till
       * whose total disagreed with the server showed the cashier
       * PAYMENT_EXCEEDS_TOTAL and stopped, which is the exact failure the
       * retry was written to prevent.
       *
       * `apiClient` now puts the `errors` map's own key names back, so the
       * snake_case name is the live one. The camelCase read stays: it costs
       * nothing, and it is what a response cached before that change still
       * looks like.
       */
      const detail =
        error instanceof ApiError
          ? (error.errors as { grand_total?: string; grandTotal?: string })
          : null;
      const serverTotal = detail?.grand_total ?? detail?.grandTotal;
      // `!partial`: a tender the cashier deliberately made short must never be
      // topped up to the server's total by a recovery meant for rounding. That
      // would charge the whole bill after a deposit was taken.
      if (
        !partial &&
        error instanceof ApiError &&
        error.code === "PAYMENT_EXCEEDS_TOTAL" &&
        serverTotal
      ) {
        /**
         * A different body under the same key is a 409 by design, so the
         * re-priced attempt gets its own key. Safe: the first attempt was
         * refused with a 400 before anything was written, so there is no sale
         * for this one to duplicate.
         */
        sale = await apiFetch<any>("/sales/", {
          method: "POST",
          idempotencyKey: `${key}-repriced`,
          body: buildBody(Number(serverTotal).toFixed(2)),
        });
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
      // Carried back so the receipt prints the recorded sale, not the till's
      // own working. Decimal crosses the API as a string; `toAmount` is the
      // one place that turns those into numbers.
      totals: {
        subtotal: toAmount(sale?.subtotal),
        discount: toAmount(sale?.discountAmount ?? sale?.discount_amount),
        tax: toAmount(sale?.taxAmount ?? sale?.tax_amount),
        grandTotal: toAmount(sale?.grandTotal ?? sale?.grand_total),
        rounding: toAmount(sale?.roundingAdjustment ?? sale?.rounding_adjustment),
        paid: toAmount(sale?.paidAmount ?? sale?.paid_amount),
        due: toAmount(sale?.dueAmount ?? sale?.due_amount),
      },
    };
  }

  /**
   * Re-price a cart against the server.
   *
   * A cart line holds a SNAPSHOT of the product — its price, its name, what the
   * shelf held — taken when it was added. That is right for a sale being rung
   * up over a minute or two, and wrong for one restored from this device's
   * storage after a reload, which can be hours later and across a price change.
   * The till would show the old figure while the server priced the sale at the
   * new one, so the cashier quotes one number and the receipt carries another —
   * and the customer is standing there for both.
   *
   * Lines are re-read by barcode, which is the same authoritative lookup a scan
   * uses. A line whose product cannot be re-read keeps what it had: a cart is a
   * sale in progress, and dropping a line because one request failed loses work
   * a cashier would have to redo from memory.
   *
   * Quantities are never touched. Those are the cashier's, not the server's.
   */
  static async repriceCart(items: CartItem[]): Promise<CartItem[]> {
    if (items.length === 0) return items;
    return Promise.all(
      items.map(async (item) => {
        if (!item.product.barcode) return item;
        const fresh = await PosService.lookupBarcode(item.product.barcode).catch(() => null);
        return fresh ? { ...item, product: fresh } : item;
      })
    );
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
export async function sellingBranch(): Promise<string> {
  return tokenStore.branch() ?? "";
}

/** That branch's main warehouse — the shelf the till sells off. */
export async function sellingWarehouse(branchId: string): Promise<string> {
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
