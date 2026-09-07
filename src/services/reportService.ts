import { apiFetch, toAmount } from "./apiClient";
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
