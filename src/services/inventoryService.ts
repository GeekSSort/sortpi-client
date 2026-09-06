import { InventoryProduct, InventoryQueryFilter } from "@/types/inventory";
import { initialInventoryProducts } from "@/lib/services/inventory.service";
import { apiFetch, apiList } from "./apiClient";
import { toInventoryProduct } from "./mappers/inventory";

/** An id and a name, for the form's dropdowns. */
export interface CatalogOption {
  id: string;
  name: string;
}

export interface CatalogOptions {
  categories: CatalogOption[];
  brands: CatalogOption[];
  units: CatalogOption[];
  taxes: CatalogOption[];
}

/**
 * What `POST /products/` accepts. Ids, not names: `category` and `unit` are
 * required foreign keys, `brand` and `tax` are optional ones.
 *
 * The old shape sent names and two prices the API has no field for, so every
 * save 400'd into a fabricated product and the screen reported a success.
 */
export interface CreateProductPayload {
  name: string;
  categoryId: string;
  unitId: string;
  brandId?: string;
  taxId?: string;
  /** Goes on the product's one variant, org-wide. */
  sellingPrice: number;
  /** `cost_price` on that variant. NOT what COGS is computed from — real cost
      is the weighted average in `stocks.average_cost` — but it is what a shop
      means by "what I paid". */
  purchasePrice?: number;
  sku?: string;
  barcode?: string;
  reorderLevel?: number;
}

export class InventoryService {
  /**
   * Fetch inventory products catalog with search & filters
   */
  static async getProducts(params?: InventoryQueryFilter): Promise<{ data: InventoryProduct[]; total: number }> {
    const fallback = () => {
      let list = [...initialInventoryProducts];
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        );
      }
      if (params?.category) {
        list = list.filter((p) => p.category.toLowerCase() === params.category?.toLowerCase());
      }
      if (params?.status) {
        list = list.filter((p) => p.status.toLowerCase() === params.status?.toLowerCase());
      }
      // The pager reads this, and it is now the real count: a hardcoded 50
      // meant the offline fallback claimed pages that did not exist.
      return { data: list, total: list.length };
    };

    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.category) searchParams.set("category", params.category);
    if (params?.brand) searchParams.set("brand", params.brand);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    // These pages filter and page in the browser, so ask for the whole
    // list rather than the API's default 20 — otherwise the pager counts
    // one page and calls it the total.
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    // One request. The category name, the brand name and the units on hand are
    // annotated onto each row by the API. This used to be FOUR requests -- the
    // products, the category table, the brand table, and a crawl of up to six
    // pages through every stock row in the shop to match by SKU -- and the
    // crawl's ceiling meant a large catalogue showed empty shelves.
    const rows = await apiList<any>(`/products/${qs}`, { method: "GET" }, fallback, (r) => r);

    // Already-mapped fallback rows carry `priceFormatted`; nothing to map.
    if (rows.data[0]?.priceFormatted !== undefined) {
      return rows as { data: InventoryProduct[]; total: number };
    }

    return {
      data: rows.data.map((row: any, i: number) => toInventoryProduct(row, i + 1)),
      total: rows.total,
    };
  }

  /**
   * The dropdown contents for the add-product form.
   *
   * They used to be hardcoded lists of names — five categories and eight
   * brands that had nothing to do with this shop's catalogue — so nothing the
   * form offered could be resolved to an id.
   */
  static async getCatalogOptions(): Promise<CatalogOptions> {
    const pick = (rows: any[]): CatalogOption[] =>
      (rows || [])
        .filter((r) => r?.id)
        .map((r) => ({ id: String(r.id), name: String(r?.name ?? "") }));

    const load = (path: string) =>
      apiList<any>(`${path}?limit=200`, { method: "GET" }, { data: [], total: 0 }, (r) => r)
        .then((res) => res.data)
        .catch(() => [] as any[]);

    const [categories, brands, units, taxes] = await Promise.all([
      load("/categories/"),
      load("/brands/"),
      load("/units/"),
      load("/taxes/"),
    ]);

    return {
      categories: pick(categories),
      brands: pick(brands),
      units: pick(units),
      taxes: pick(taxes),
    };
  }

  /**
   * Create a product and its one variant.
   *
   * `sku`, `barcode` and `price` are the API's write-only conveniences for the
   * common case — one product, one variant, one org-wide price. No fallback:
   * a failure here has to reach the form, because the previous version's
   * fallback is exactly what let a 400 look like a saved product.
   */
  static async createProduct(payload: CreateProductPayload): Promise<InventoryProduct> {
    const created = await apiFetch<any>("/products/", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        category: payload.categoryId,
        unit: payload.unitId,
        ...(payload.brandId ? { brand: payload.brandId } : {}),
        ...(payload.taxId ? { tax: payload.taxId } : {}),
        ...(payload.barcode ? { barcode: payload.barcode } : {}),
        ...(payload.reorderLevel != null ? { reorder_level: payload.reorderLevel } : {}),
        price: payload.sellingPrice,
        // One variant, spelled out rather than left to the `sku` convenience,
        // because that shortcut has nowhere to put a cost price.
        variants: [
          {
            name: "Default",
            is_default: true,
            ...(payload.sku ? { sku: payload.sku } : {}),
            ...(payload.purchasePrice != null ? { cost_price: payload.purchasePrice } : {}),
          },
        ],
      }),
    });
    return toInventoryProduct(created, 1);
  }
}
