import { PurchaseRecord, PurchaseQueryFilter } from "@/types/purchases";
import { apiDownload, apiFetch, apiList, apiUpload, saveBlob, toAmount } from "./apiClient";
import { variantLabelOf } from "./mappers/product";
import { toPurchaseRecord } from "./mappers/purchase";

export interface PurchaseDetailLine {
  /** The line's own id. Not sent back on an edit — `items` REPLACES the set,
      so a line is identified by its variant. */
  id: string;
  /** What an edit sends back, and the only stable handle on a line. */
  variantId: string;
  name: string;
  /**
   * WHICH variant was ordered — "500ml".
   *
   * A purchase line names a variant, not a product: "20 × Coca-Cola" is not
   * something a supplier can pick against when the product comes in three
   * sizes, and it is not something a receiving clerk can book in either.
   */
  variantLabel: string;
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
  /**
   * INPUT VAT on this line, as a FRACTION — 0.15 is 15%.
   *
   * The VAT the shop PAYS. Recoverable, posted to VAT Receivable, and
   * emphatically not the rate on the customer's receipt: folding input VAT
   * into the goods would value every shelf at the tax-inclusive price and
   * every margin computed off it would be wrong by the VAT rate.
   *
   * Purchase tax is EXCLUSIVE — a supplier invoice quotes net and adds VAT.
   */
  taxRate?: number;
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


/**
 * One row of the import report, as the screen shows it.
 *
 * A row error does NOT fail the request — the file around it still imports —
 * so both statuses arrive in the same list and the screen decides what to do
 * with each.
 */
export interface PurchaseImportRow {
  /** The line in the spreadsheet, so somebody can go and find it. Row 1 is the
      heading, so the first item is row 2. */
  line: number;
  status: "ok" | "error";
  product: string;
  variant: string;
  quantity: string;
  unitCost: string;
  /** Importing this row would add a product the shop does not have. */
  newProduct: boolean;
  /** …or a new size of one it does. */
  newVariant: boolean;
  /** Written for a shopkeeper: "Quantity is missing." */
  message: string | null;
  code: string | null;
}

/** A resolved line, in the shape the Add Purchase table renders. */
export interface PurchaseImportLine {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  taxRate: number;
  newProduct: boolean;
  newVariant: boolean;
}

export interface PurchaseImportReport {
  /** False for a check — which wrote nothing and returned no usable lines. */
  committed: boolean;
  total: number;
  valid: number;
  failed: number;
  newProducts: number;
  newVariants: number;
  rows: PurchaseImportRow[];
  lines: PurchaseImportLine[];
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
            // Input VAT: what the SUPPLIER charges, which is recoverable and
            // posts to VAT Receivable. A fraction, like every other rate on
            // this API. Omitted when zero so an untaxed delivery sends nothing
            // rather than an explicit "0".
            ...(l.taxRate && l.taxRate > 0 ? { tax_rate: l.taxRate.toFixed(4) } : {}),
          })),
        }),
      },
      toPurchaseRecord
    );
  }


  /**
   * Turn a CSV of items into purchase lines.
   *
   * This does NOT create a purchase, and that is what lets both screens share
   * it: the Add Purchase page needs the lines BEFORE the purchase exists so a
   * buyer can check them and press its own Save, and the Purchases list builds
   * its own header and posts the lines to the same `POST /purchases/`. One
   * import path, one purchase path — and the second is the one that was
   * already there.
   *
   * `commit: false` is the check, and it is what a screen asks for first: it
   * writes nothing at all — no product, no variant — while reporting exactly
   * what the real run would do.
   */
  static async importCsv(file: File, commit = false): Promise<PurchaseImportReport> {
    const form = new FormData();
    form.append("file", file);
    form.append("commit", commit ? "true" : "false");

    const row = await apiUpload<any>("/purchases/import/", form);
    const pick = <T,>(source: any, ...names: string[]): T | undefined => {
      for (const name of names) if (source?.[name] !== undefined) return source[name] as T;
      return undefined;
    };
    return {
      committed: Boolean(row?.commit),
      total: Number(row?.total ?? 0),
      valid: Number(row?.valid ?? 0),
      failed: Number(row?.failed ?? 0),
      newProducts: Number(pick(row, "newProducts", "new_products") ?? 0),
      newVariants: Number(pick(row, "newVariants", "new_variants") ?? 0),
      rows: (Array.isArray(row?.rows) ? row.rows : []).map((r: any) => ({
        line: Number(r?.line ?? 0),
        status: r?.status === "ok" ? "ok" : "error",
        product: String(r?.product ?? ""),
        variant: String(r?.variant ?? ""),
        quantity: String(r?.quantity ?? ""),
        unitCost: String(pick(r, "unitCost", "unit_cost") ?? ""),
        newProduct: Boolean(pick(r, "newProduct", "new_product")),
        newVariant: Boolean(pick(r, "newVariant", "new_variant")),
        message: (r?.message as string) ?? null,
        code: (r?.code as string) ?? null,
      })),
      lines: (Array.isArray(row?.lines) ? row.lines : []).map((l: any) => ({
        variantId: String(l?.variant ?? ""),
        productName: String(pick(l, "productName", "product_name") ?? ""),
        variantName: String(pick(l, "variantName", "variant_name") ?? ""),
        sku: String(l?.sku ?? ""),
        quantity: toAmount(l?.quantity),
        unitCost: toAmount(pick(l, "unitCost", "unit_cost")),
        taxRate: toAmount(pick(l, "taxRate", "tax_rate")),
        newProduct: Boolean(pick(l, "newProduct", "new_product")),
        newVariant: Boolean(pick(l, "newVariant", "new_variant")),
      })),
    };
  }

  /**
   * Download the template a shop fills in.
   *
   * Through the API rather than a static file in `public/`: the columns are
   * defined beside the importer that reads them, so a template served from
   * there is always one the import accepts. A copy in the front end is a copy
   * that goes stale the first time a column is added.
   */
  static async downloadTemplate(): Promise<void> {
    const { blob, filename } = await apiDownload(
      "/purchases/import-template/",
      "purchase-import-template.csv"
    );
    saveBlob(blob, filename);
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
        // A purchase line names a VARIANT: an order for twenty Coca-Cola is
        // twenty of ONE size, and the receiving clerk has to know which.
        variantLabel: variantLabelOf(it),
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
