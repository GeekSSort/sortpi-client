import { PurchaseRecord, PurchaseQueryFilter } from "@/types/purchases";
import { apiFetch, apiList, toAmount } from "./apiClient";
import { toPurchaseRecord } from "./mappers/purchase";

export interface PurchaseDetailLine {
  /** The line's own id. Not sent back on an edit — `items` REPLACES the set,
      so a line is identified by its variant. */
  id: string;
  /** What an edit sends back, and the only stable handle on a line. */
  variantId: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseDetail {
  id: string;
  referenceNo: string;
  supplierName: string;
  supplierInvoiceNo: string;
  purchaseDate: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  grandTotal: number;
  paid: number;
  due: number;
  items: PurchaseDetailLine[];
}

/** One line on a new purchase order. */
export interface NewPurchaseLine {
  variantId: string;
  quantity: number;
  /** What the supplier charges per unit. This is what stock costs when the
      goods are received, and what every margin is measured against. */
  unitCost: number;
}

/** What `POST /purchases/` needs. Ids, not names. */
export interface CreatePurchasePayload {
  referenceNo: string;
  supplierId: string;
  branchId: string;
  warehouseId: string;
  purchaseDate: string;
  supplierInvoiceNo?: string;
  note?: string;
  items: NewPurchaseLine[];
}

export class PurchaseService {
  /**
   * Draft a purchase order.
   *
   * A DRAFT and nothing more: no stock moves and the supplier is owed nothing
   * until it is CONFIRMED, and nothing arrives until it is RECEIVED. That is
   * why this screen ends at "saved" rather than at "the goods are in".
   */
  static async createPurchase(payload: CreatePurchasePayload): Promise<PurchaseRecord> {
    return apiFetch<any>(
      "/purchases/",
      {
        method: "POST",
        body: JSON.stringify({
          reference_no: payload.referenceNo,
          supplier: payload.supplierId,
          branch: payload.branchId,
          warehouse: payload.warehouseId,
          purchase_date: payload.purchaseDate,
          ...(payload.supplierInvoiceNo ? { supplier_invoice_no: payload.supplierInvoiceNo } : {}),
          ...(payload.note ? { note: payload.note } : {}),
          items: payload.items.map((l) => ({
            variant: l.variantId,
            quantity: l.quantity,
            unit_cost: l.unitCost,
          })),
        }),
      },
      toPurchaseRecord
    );
  }

  /**
   * Fetch purchase history records with search & filters
   */
  static async getPurchases(params?: PurchaseQueryFilter): Promise<{ data: PurchaseRecord[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    // `paymentStatus` is NOT sent: it is derived here from grand_total against
    // due_amount, and the API has no such field to filter on. Sending it was a
    // no-op the endpoint ignored.
    if (params?.supplier) searchParams.set("supplier", params.supplier);
    if (params?.startDate) searchParams.set("date_from", params.startDate);
    if (params?.endDate) searchParams.set("date_to", params.endDate);
    if (params?.page) searchParams.set("page", String(params.page));
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return apiList<PurchaseRecord>(
      `/purchases/${qs}`,
      { method: "GET" },
      // Unmapped, the supplier arrives as an id under a key the table reads as
      // an object, and every column but the date comes out blank.
      toPurchaseRecord
    );
  }

  /**
   * DRAFT → CONFIRMED. The order is placed; nothing has arrived yet.
   *
   * This and the three below were on the API from the start with nothing on
   * the screen able to call them, so "Mark received" and "Mark paid" changed a
   * row on screen and nothing else.
   */
  /**
   * One purchase, with its lines.
   *
   * Same reason as the sales detail: the list row carries a count and a total,
   * so the printed order could name neither what was ordered nor at what
   * price — which is most of what a purchase order is for.
   */
  static async getPurchase(id: string): Promise<PurchaseDetail> {
    const row = await apiFetch<any>(`/purchases/${id}/`, { method: "GET" });
    return {
      id: String(row?.id ?? id),
      referenceNo: String(row?.referenceNo ?? row?.reference_no ?? ""),
      supplierName: String(row?.supplierName ?? row?.supplier_name ?? ""),
      supplierInvoiceNo: String(row?.supplierInvoiceNo ?? row?.supplier_invoice_no ?? ""),
      purchaseDate: String(row?.purchaseDate ?? row?.purchase_date ?? ""),
      status: String(row?.status ?? ""),
      subtotal: toAmount(row?.subtotal),
      discount: toAmount(row?.discountAmount ?? row?.discount_amount),
      tax: toAmount(row?.taxAmount ?? row?.tax_amount),
      shipping: toAmount(row?.shippingCost ?? row?.shipping_cost),
      grandTotal: toAmount(row?.grandTotal ?? row?.grand_total),
      paid: toAmount(row?.paidAmount ?? row?.paid_amount),
      due: toAmount(row?.dueAmount ?? row?.due_amount),
      items: (row?.items ?? []).map((it: any) => ({
        id: String(it?.id ?? ""),
        variantId: String(it?.variant ?? ""),
        name: String(it?.productName ?? it?.product_name ?? it?.sku ?? ""),
        sku: String(it?.sku ?? ""),
        quantity: toAmount(it?.quantity),
        unitCost: toAmount(it?.unitCost ?? it?.unit_cost),
        lineTotal: toAmount(it?.lineTotal ?? it?.line_total),
      })),
    };
  }

  /**
   * Edit a DRAFT order.
   *
   * DRAFT only, and the API says so: editing a confirmed purchase would change
   * a figure the supplier ledger has already been posted against, leaving a
   * payable nothing explains. After confirmation the correction is a return.
   *
   * `items` REPLACES the line set rather than patching it, which is what the
   * service does — so the caller sends every line it wants to keep.
   */
  static async updatePurchase(
    id: string,
    patch: {
      supplierId?: string;
      purchaseDate?: string;
      supplierInvoiceNo?: string;
      note?: string;
      items?: NewPurchaseLine[];
    }
  ): Promise<PurchaseRecord> {
    const body: Record<string, unknown> = {};
    if (patch.supplierId !== undefined) body.supplier = patch.supplierId;
    if (patch.purchaseDate !== undefined) body.purchase_date = patch.purchaseDate;
    if (patch.supplierInvoiceNo !== undefined) body.supplier_invoice_no = patch.supplierInvoiceNo;
    if (patch.note !== undefined) body.note = patch.note;
    if (patch.items !== undefined) {
      body.items = patch.items.map((l) => ({
        variant: l.variantId,
        quantity: l.quantity,
        unit_cost: l.unitCost,
      }));
    }
    return apiFetch<any>(
      `/purchases/${id}/`,
      { method: "PATCH", body: JSON.stringify(body) },
      toPurchaseRecord
    );
  }

  static async confirm(id: string): Promise<PurchaseRecord> {
    return apiFetch<any>(`/purchases/${id}/confirm/`, { method: "POST" }, toPurchaseRecord);
  }

  /**
   * Goods in. Writes the stock movements and the supplier ledger entry.
   *
   * Omitting `lines` receives everything still outstanding. Sending them and
   * leaving one out means that line got NOTHING — the opposite default would
   * let a clerk recording one line silently mark the whole order delivered.
   */
  static async receive(
    id: string,
    lines?: { itemId: string; quantity: number }[]
  ): Promise<PurchaseRecord> {
    return apiFetch<any>(
      `/purchases/${id}/receive/`,
      {
        method: "POST",
        body: JSON.stringify(
          lines ? { lines: lines.map((l) => ({ item: l.itemId, quantity: l.quantity })) } : {}
        ),
      },
      toPurchaseRecord
    );
  }

  /**
   * Money out against what is owed on this order.
   *
   * `payment_date` is REQUIRED — `PurchasePayment.payment_date` is a DateField
   * with no default, so the serializer demands it. Leaving it out 400'd every
   * payment this screen ever tried to record, with a bare "Validation failed".
   * Today unless the caller says otherwise: a payment is being recorded as it
   * happens, and back-dating one is a deliberate act with its own argument.
   */
  static async recordPayment(
    id: string,
    amount: number,
    method = "CASH",
    note = "",
    paymentDate?: string
  ): Promise<{ amount: number }> {
    const row = await apiFetch<any>(`/purchases/${id}/payments/`, {
      method: "POST",
      body: JSON.stringify({
        amount,
        payment_method: method,
        payment_date: paymentDate || new Date().toISOString().slice(0, 10),
        note,
      }),
    });
    return { amount: toAmount(row?.amount) };
  }

  /** Cancels the order. Received goods are not un-received by this. */
  static async cancel(id: string): Promise<PurchaseRecord> {
    return apiFetch<any>(`/purchases/${id}/cancel/`, { method: "POST" }, toPurchaseRecord);
  }
}
