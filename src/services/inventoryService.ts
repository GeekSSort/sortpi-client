import { InventoryProduct, InventoryQueryFilter } from "@/types/inventory";
import { apiFetch, apiList } from "./apiClient";
import { toInventoryProduct } from "./mappers/inventory";

/** An id and a name, for the form's dropdowns. */
export interface CatalogOption {
  id: string;
  name: string;
}

/** A tax carries its percentage: the Add Product form takes a rate, not a
    name, so it has to be able to tell whether the shop already has a row for
    what was typed. */
export interface TaxOption extends CatalogOption {
  /** A FRACTION, as the API stores it: 0.15 is 15%. */
  rate: number;
}

export interface CatalogOptions {
  categories: CatalogOption[];
  brands: CatalogOption[];
  units: CatalogOption[];
  taxes: TaxOption[];
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
  /** Goes on the product's one variant, org-wide. OPTIONAL: a product first
      met on a purchase order has a cost but no shelf price yet, and writing a
      zero would put it on the till at nothing. Left out, the variant comes back
      unpriced and the POS says "No price" until somebody sets one. */
  sellingPrice?: number;
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
    const rows = await apiList<any>(`/products/${qs}`, { method: "GET" }, (r) => r);

    // The row number counts from the start of the LIST, not the start of the
    // page. Numbering each page from 1 made every page look like the first
    // eight products — the only thing on the row that says where you are.
    const offset = ((params?.page ?? 1) - 1) * (params?.limit ?? 200);

    return {
      data: rows.data.map((row: any, i: number) => toInventoryProduct(row, offset + i + 1)),
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

    // No catch: a swallowed failure here filled the form's dropdowns with
    // nothing, and an empty category list is indistinguishable from a shop
    // that has not made any categories yet. The screen has an error state for
    // this; it can only use it if the failure reaches it.
    const load = (path: string) =>
      apiList<any>(`${path}?limit=200`, { method: "GET" }, (r) => r).then((res) => res.data);

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
      taxes: (taxes || [])
        .filter((r: any) => r?.id)
        .map((r: any) => ({
          id: String(r.id),
          name: String(r?.name ?? ""),
          rate: Number(r?.rate ?? 0),
        })),
    };
  }

  /**
   * Find the shop's tax row for a rate, or make one.
   *
   * `Product.tax` is a foreign key: a rate typed into a form has nowhere to go
   * unless a row carries it. Matching first means typing 15 twice does not
   * leave a shop with two rows both called 15%.
   *
   * ⚠ `percent` is what the person typed. `Tax.rate` is a FRACTION — 15% is
   * 0.15 — and this used to post the percentage straight through. A shop that
   * typed 5 got a tax row of 5.0000, which is FIVE HUNDRED PER CENT, and every
   * sale of a product carrying it would have charged a hundred times the tax
   * intended. Two such rows were found in a live database. The API now refuses
   * anything above 1; this is the side that has to send the right number.
   */
  static async resolveTax(percent: number, existing: readonly TaxOption[]): Promise<string> {
    const fraction = percent / 100;
    const match = existing.find((t) => Math.abs(t.rate - fraction) < 0.000001);
    if (match) return match.id;

    const created = await apiFetch<any>("/taxes/", {
      method: "POST",
      // Named after the PERCENTAGE, because that is what a shopkeeper reads;
      // stored as the fraction, because that is what the engine prices with.
      body: JSON.stringify({ name: `${percent}%`, rate: fraction.toFixed(4) }),
    });
    return String(created?.id ?? "");
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
        // Only when there is one. `price` writes a ProductPrice row, and a row
        // saying 0 is a product the till will sell for nothing — which reads
        // exactly like a product nobody has priced, and is not.
        ...(payload.sellingPrice != null && payload.sellingPrice > 0
          ? { price: payload.sellingPrice }
          : {}),
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

  /**
   * Change what a product IS — its name, its brand, its category.
   *
   * NOT its price: a price belongs to a variant and `PATCH /products/{id}`
   * drops the `price` convenience, so that is `setPrice` below. This screen
   * used to write both into its own cache and nothing else, so an edit
   * survived until the next refetch and no further.
   */
  static async updateProduct(
    id: string,
    patch: { name?: string; brandId?: string | null; categoryId?: string; reorderLevel?: number }
  ): Promise<InventoryProduct> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    // null clears the brand, which is a real edit; undefined leaves it alone.
    if (patch.brandId !== undefined) body.brand = patch.brandId || null;
    if (patch.categoryId !== undefined) body.category = patch.categoryId;
    if (patch.reorderLevel !== undefined) body.reorder_level = patch.reorderLevel;

    const updated = await apiFetch<any>(`/products/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return toInventoryProduct(updated, 1);
  }

  /**
   * Set what a product sells for, organization-wide.
   *
   * A branch that has set its own price keeps it — the API resolves the branch
   * row over this one — which is the same rule the till reads by.
   */
  static async setPrice(id: string, price: number): Promise<InventoryProduct> {
    const updated = await apiFetch<any>(`/products/${id}/price/`, {
      method: "PUT",
      body: JSON.stringify({ price }),
    });
    return toInventoryProduct(updated, 1);
  }

  /**
   * Put a picture on a product. Three steps, because the bytes never touch
   * the API server.
   *
   * 1. Ask for a ticket. The API reserves a PENDING row and signs a PUT URL
   *    for the bucket.
   * 2. PUT the file straight at the bucket. Plain `fetch`, NOT `apiFetch`:
   *    the URL is already signed, and sending our `Authorization` header
   *    alongside the signature makes the bucket reject the request.
   * 3. Confirm. The server reads the first bytes and identifies the file by
   *    signature — a `.png` that is really something else is deleted there,
   *    which is why the row is not READY until this call returns.
   *
   * The screen used to call `URL.createObjectURL` and stop, so the picture
   * looked chosen, survived until the page navigated, and was never sent
   * anywhere. Every product in the catalogue had no image as a result.
   */
  static async uploadProductImage(productId: string, file: File): Promise<void> {
    const ticket = await apiFetch<any>(`/products/${productId}/images/`, {
      method: "POST",
      body: JSON.stringify({ filename: file.name, content_type: file.type }),
    });

    const uploadUrl: string = ticket?.uploadUrl ?? ticket?.upload_url ?? "";
    const imageId: string = ticket?.image?.id ?? "";
    if (!uploadUrl || !imageId) throw new Error("The upload could not be started.");

    const put = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      // Must match what the URL was signed with, or the bucket refuses it.
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) throw new Error(`The image could not be stored (${put.status}).`);

    await apiFetch<unknown>(`/products/${productId}/images/${imageId}/confirm/`, {
      method: "POST",
    });
  }
}

/**
 * Categories and brands, as things a shop can manage rather than a fixed list.
 *
 * Both are plain named lookups behind the same endpoints, so one service with
 * a `kind` beats two near-identical ones. The screen that uses it is a single
 * modal opened in either mode.
 *
 * Delete is a real DELETE, and the API refuses one that products still point
 * at — that refusal is the useful answer, so it is passed through rather than
 * pre-empted with a count the client would have to keep in step.
 */
export type CatalogKind = "category" | "brand";

const PATHS: Record<CatalogKind, string> = {
  category: "/categories/",
  brand: "/brands/",
};

export class CatalogService {
  static async list(kind: CatalogKind): Promise<CatalogOption[]> {
    const res = await apiList<any>(`${PATHS[kind]}?limit=200`, { method: "GET" }, (r) => r);
    return res.data
      .filter((r: any) => r?.id)
      .map((r: any) => ({ id: String(r.id), name: String(r?.name ?? "") }));
  }

  static async create(kind: CatalogKind, name: string): Promise<CatalogOption> {
    const row = await apiFetch<any>(PATHS[kind], {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    return { id: String(row?.id ?? ""), name: String(row?.name ?? "") };
  }

  static async rename(kind: CatalogKind, id: string, name: string): Promise<CatalogOption> {
    const row = await apiFetch<any>(`${PATHS[kind]}${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    });
    return { id: String(row?.id ?? id), name: String(row?.name ?? name) };
  }

  static async remove(kind: CatalogKind, id: string): Promise<void> {
    await apiFetch<unknown>(`${PATHS[kind]}${id}/`, { method: "DELETE" });
  }
}
