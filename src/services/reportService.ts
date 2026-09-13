import { apiFetch, toAmount } from "./apiClient";
import { variantLabelOf } from "./mappers/product";
import { PosService } from "./posService";
import { ProductItem } from "@/types/pos";

/**
 * The reports endpoints, for the screens that want one report rather than the
 * dashboard's bundle.
 *
 * `/reports/dashboard/` embeds five of these and is the right call when a page
 * wants all five. Top sellers is not one of them, so it is asked for on its
 * own instead of being guessed at from the catalogue.
 */

export interface TopProduct {
  variantId: string;
  sku: string;
  name: string;
  quantitySold: number;
  revenue: number;
  grossProfit: number;
}

export interface ReportWindow {
  branchId?: string | null;
  fromDate?: string;
  toDate?: string;
}

/** One variant's line in a sales report. */
export interface ProductRow {
  variantId: string;
  sku: string;
  name: string;
  /** WHICH size — "500ml". Empty for a product sold one way. */
  variantLabel: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  grossProfit: number;
}

/** One tender the shop took, and how much of the takings it is. */
export interface TenderRow {
  label: string;
  amount: number;
  count: number;
  share: number;
}

export interface CashierRow {
  name: string;
  saleCount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
}

export interface PnL {
  revenue: number;
  cost: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
}

export interface ExpenseRow {
  name: string;
  total: number;
}

/** A partner and what is outstanding between them and the shop. */
export interface DueRow {
  name: string;
  outstanding: number;
}

export interface LowStockRow {
  sku: string;
  name: string;
  variantLabel: string;
  warehouse: string;
  quantity: number;
  threshold: number;
}

export interface ExpiringRow {
  sku: string;
  name: string;
  variantLabel: string;
  warehouse: string;
  quantity: number;
  expiresOn: string;
}

export interface PurchaseReturnRow {
  referenceNo: string;
  supplier: string;
  returnedOn: string;
  total: number;
  status: string;
}

export interface CategoryRow {
  name: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  grossProfit: number;
}

export interface CustomerRow {
  name: string;
  saleCount: number;
  revenue: number;
  paid: number;
  due: number;
}

export interface BranchRow {
  name: string;
  saleCount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
}

export interface TrendPoint {
  at: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  saleCount: number;
}

export interface StockRow {
  sku: string;
  name: string;
  variantLabel: string;
  warehouse: string;
  quantity: number;
  available: number;
  averageCost: number;
  stockValue: number;
}

export interface SupplierRow {
  name: string;
  orderCount: number;
  total: number;
  paid: number;
  due: number;
}

/** Customer and supplier dues answer in the same shape. */
function partnerDue(r: any): DueRow {
  return {
    name: String(r.partnerName ?? r.partner_name ?? "—"),
    outstanding: toAmount(r.outstanding),
  };
}

function scope(window?: ReportWindow): string {
  const params = new URLSearchParams();
  if (window?.branchId) params.set("branch_id", window.branchId);
  if (window?.fromDate) params.set("from_date", window.fromDate);
  if (window?.toDate) params.set("to_date", window.toDate);
  return params.toString() ? `?${params.toString()}` : "";
}

export class ReportService {
  /**
   * What actually sold, best first.
   *
   * The reports endpoint groups sale LINES by variant and orders by revenue,
   * so this is the shop's own answer to "top selling". The page used to show
   * the first ten rows of the catalogue in SKU order under that heading, which
   * is a different claim entirely and was true only by accident.
   *
   * `cost_of_goods` and `gross_profit` are gated on `reports.view_profit`; a
   * caller without it gets the row with those keys missing, so profit reads 0
   * rather than throwing.
   */
  /**
   * One report, unwrapped.
   *
   * Every `/reports/...` endpoint answers the same two shapes — a bare array,
   * or an envelope with the rows under `data` — so the unwrapping is here
   * rather than repeated at each call site, where one of them would eventually
   * get it wrong and read an envelope as a single row.
   */
  private static async rows(path: string, window?: ReportWindow): Promise<any[]> {
    const payload = await apiFetch<any>(`${path}${scope(window)}`, { method: "GET" });
    if (Array.isArray(payload)) return payload;
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  /** What sold, by VARIANT — the row a 500ml and a 1L each get. */
  static async salesByProduct(window?: ReportWindow): Promise<ProductRow[]> {
    return (await ReportService.rows("/sales/by-product/", window)).map((r) => ({
      variantId: String(r.variantId ?? r.variant_id ?? ""),
      sku: String(r.sku ?? ""),
      name: String(r.productName ?? r.product_name ?? "—"),
      variantLabel: variantLabelOf(r),
      quantitySold: toAmount(r.quantitySold ?? r.quantity_sold),
      revenue: toAmount(r.revenue),
      cost: toAmount(r.costOfGoods ?? r.cost_of_goods),
      grossProfit: toAmount(r.grossProfit ?? r.gross_profit),
    }));
  }

  /** What the shop was PAID IN — the report a terminal is reconciled against. */
  static async salesByPaymentMethod(window?: ReportWindow): Promise<TenderRow[]> {
    return (await ReportService.rows("/sales/by-payment-method/", window)).map((r) => ({
      label: String(r.label ?? r.method ?? "—"),
      amount: toAmount(r.amount),
      count: Number(r.paymentCount ?? r.payment_count ?? 0),
      share: toAmount(r.share),
    }));
  }

  static async salesByCategory(window?: ReportWindow): Promise<CategoryRow[]> {
    return (await ReportService.rows("/sales/by-category/", window)).map((r) => ({
      name: String(r.categoryName ?? r.category_name ?? "Uncategorised"),
      quantitySold: toAmount(r.quantitySold ?? r.quantity_sold),
      revenue: toAmount(r.revenue),
      cost: toAmount(r.costOfGoods ?? r.cost_of_goods),
      grossProfit: toAmount(r.grossProfit ?? r.gross_profit),
    }));
  }

  static async salesByCustomer(window?: ReportWindow): Promise<CustomerRow[]> {
    return (await ReportService.rows("/sales/by-customer/", window)).map((r) => ({
      name: String(r.customerName ?? r.customer_name ?? "—"),
      saleCount: Number(r.saleCount ?? r.sale_count ?? 0),
      revenue: toAmount(r.revenue),
      paid: toAmount(r.paid),
      due: toAmount(r.due),
    }));
  }

  static async salesByBranch(window?: ReportWindow): Promise<BranchRow[]> {
    return (await ReportService.rows("/sales/by-branch/", window)).map((r) => ({
      name: String(r.branchName ?? r.branch_name ?? "—"),
      saleCount: Number(r.saleCount ?? r.sale_count ?? 0),
      revenue: toAmount(r.revenue),
      cost: toAmount(r.costOfGoods ?? r.cost_of_goods),
      grossProfit: toAmount(r.grossProfit ?? r.gross_profit),
    }));
  }

  /** Revenue, cost and profit a day at a time — the trend line. */
  static async salesDaily(window?: ReportWindow): Promise<TrendPoint[]> {
    return (await ReportService.rows("/sales/daily/", window)).map((r) => ({
      at: String(r.day ?? r.date ?? ""),
      revenue: toAmount(r.revenue),
      cost: toAmount(r.costOfGoods ?? r.cost_of_goods),
      grossProfit: toAmount(r.grossProfit ?? r.gross_profit),
      saleCount: Number(r.saleCount ?? r.sale_count ?? 0),
    }));
  }

  /** What the shelves are worth, by variant. */
  static async inventoryValuation(window?: ReportWindow): Promise<StockRow[]> {
    return (await ReportService.rows("/inventory/valuation/", window)).map((r) => ({
      sku: String(r.sku ?? ""),
      name: String(r.productName ?? r.product_name ?? "—"),
      variantLabel: variantLabelOf(r),
      warehouse: String(r.warehouse ?? "—"),
      quantity: toAmount(r.quantity),
      available: toAmount(r.available),
      averageCost: toAmount(r.averageCost ?? r.average_cost),
      stockValue: toAmount(r.stockValue ?? r.stock_value),
    }));
  }

  static async purchasesBySupplier(window?: ReportWindow): Promise<SupplierRow[]> {
    return (await ReportService.rows("/purchases/by-supplier/", window)).map((r) => ({
      name: String(r.supplierName ?? r.supplier_name ?? "—"),
      orderCount: Number(r.purchaseCount ?? r.purchase_count ?? r.orderCount ?? 0),
      total: toAmount(r.total ?? r.grandTotal ?? r.grand_total),
      paid: toAmount(r.paid ?? r.paidAmount ?? r.paid_amount),
      due: toAmount(r.due ?? r.dueAmount ?? r.due_amount),
    }));
  }

  /** Who rang it up. The report a shift or a commission is settled from. */
  static async salesByCashier(window?: ReportWindow): Promise<CashierRow[]> {
    return (await ReportService.rows("/sales/by-cashier/", window)).map((r) => ({
      name: String(r.cashierEmail ?? r.cashier_email ?? "—"),
      saleCount: Number(r.saleCount ?? r.sale_count ?? 0),
      revenue: toAmount(r.revenue),
      cost: toAmount(r.costOfGoods ?? r.cost_of_goods),
      grossProfit: toAmount(r.grossProfit ?? r.gross_profit),
    }));
  }

  /** Revenue, COGS, expenses and what is left. */
  static async profitAndLoss(window?: ReportWindow): Promise<PnL> {
    const payload = await apiFetch<any>(`/finance/pnl/${scope(window)}`, { method: "GET" });
    const r = payload?.data ?? payload ?? {};
    return {
      revenue: toAmount(r.revenue),
      cost: toAmount(r.costOfGoods ?? r.cost_of_goods),
      grossProfit: toAmount(r.grossProfit ?? r.gross_profit),
      expenses: toAmount(r.expenses),
      netProfit: toAmount(r.netProfit ?? r.net_profit),
    };
  }

  /** Where the money went, by expense category. */
  static async expenses(window?: ReportWindow): Promise<ExpenseRow[]> {
    return (await ReportService.rows("/finance/expenses/", window)).map((r) => ({
      name: String(r.categoryName ?? r.category_name ?? "Uncategorised"),
      total: toAmount(r.total),
    }));
  }

  /** What customers owe, and what the shop owes suppliers. */
  static async customerDue(window?: ReportWindow): Promise<DueRow[]> {
    return (await ReportService.rows("/finance/customer-due/", window)).map(partnerDue);
  }

  static async supplierDue(window?: ReportWindow): Promise<DueRow[]> {
    return (await ReportService.rows("/finance/supplier-due/", window)).map(partnerDue);
  }

  /** Lines at or under their reorder level — what to buy next. */
  static async lowStock(window?: ReportWindow): Promise<LowStockRow[]> {
    return (await ReportService.rows("/inventory/low-stock/", window)).map((r) => ({
      sku: String(r.sku ?? ""),
      name: String(r.productName ?? r.product_name ?? "—"),
      variantLabel: variantLabelOf(r),
      warehouse: String(r.warehouse ?? "—"),
      quantity: toAmount(r.quantity),
      threshold: Number(r.threshold ?? 0),
    }));
  }

  /** Stock that has gone off, or is about to. */
  static async expiring(window?: ReportWindow): Promise<ExpiringRow[]> {
    return (await ReportService.rows("/inventory/expired/", window)).map((r) => ({
      sku: String(r.sku ?? ""),
      name: String(r.productName ?? r.product_name ?? "—"),
      variantLabel: variantLabelOf(r),
      warehouse: String(r.warehouse ?? "—"),
      quantity: toAmount(r.quantity),
      expiresOn: String(r.expiryDate ?? r.expiry_date ?? r.date ?? ""),
    }));
  }

  /** What went back to a supplier. */
  static async purchaseReturns(window?: ReportWindow): Promise<PurchaseReturnRow[]> {
    return (await ReportService.rows("/purchases/returns/", window)).map((r) => ({
      referenceNo: String(r.referenceNo ?? r.reference_no ?? ""),
      supplier: String(r.supplier ?? "—"),
      returnedOn: String(r.returnDate ?? r.return_date ?? ""),
      total: toAmount(r.grandTotal ?? r.grand_total),
      status: String(r.status ?? ""),
    }));
  }

  static async getTopProducts(
    window?: ReportWindow,
    limit = 10
  ): Promise<TopProduct[]> {
    const payload = await apiFetch<any>(`/sales/by-product/${scope(window)}`, {
      method: "GET",
    });
    const rows: any[] = Array.isArray(payload) ? payload : (payload?.data ?? []);

    return rows.slice(0, limit).map((row) => ({
      variantId: String(row.variantId ?? row.variant_id ?? ""),
      sku: String(row.sku ?? ""),
      name: String(row.productName ?? row.product_name ?? row.sku ?? "—"),
      quantitySold: toAmount(row.quantitySold ?? row.quantity_sold),
      revenue: toAmount(row.revenue),
      grossProfit: toAmount(row.grossProfit ?? row.gross_profit),
    }));
  }
}

/** A top seller with the catalogue detail a tile needs to draw it. */
export interface TopSellerTile extends TopProduct {
  image: string;
  priceFormatted: string;
  stock: number;
}

/**
 * The top sellers, with their photograph, shelf price and stock.
 *
 * Two sources because no single endpoint has both: `/reports/sales/by-product/`
 * knows what sold and in what order, and only the catalogue knows what the
 * thing looks like and how many are left. Joined on SKU, one small lookup per
 * tile — ten of them, in parallel, and the answers are cached.
 *
 * A seller whose catalogue row cannot be found still gets a tile: it sold, and
 * dropping it would quietly shorten the list.
 */
export async function topSellerTiles(
  window?: ReportWindow,
  limit = 10
): Promise<TopSellerTile[]> {
  const top = await ReportService.getTopProducts(window, limit);

  const detail = await Promise.all(
    top.map((row) =>
      PosService.getProducts({ search: row.sku, limit: 1 })
        .then((page) => page.data[0] as ProductItem | undefined)
        .catch(() => undefined)
    )
  );

  return top.map((row, i) => {
    const found = detail[i];
    // The average taken per unit over the window, when the catalogue has no
    // row to read a shelf price from. Both are money the shop actually saw.
    const perUnit = row.quantitySold > 0 ? row.revenue / row.quantitySold : 0;
    return {
      ...row,
      name: found?.name || row.name,
      image: found?.image || "",
      priceFormatted: found?.priceFormatted || `৳ ${Math.round(perUnit).toLocaleString("en-IN")}`,
      stock: found?.stock ?? 0,
    };
  });
}
