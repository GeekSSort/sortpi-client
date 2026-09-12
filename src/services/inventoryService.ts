import { InventoryProduct, InventoryQueryFilter } from "@/types/inventory";
import { ApiError, apiDownload, apiFetch, apiList, apiUpload, saveBlob } from "./apiClient";
import { toInventoryProduct, toInventoryVariants } from "./mappers/inventory";
import { invalidate } from "@/lib/query/useQuery";

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
  /**
   * The sizes, colours or forms this product is sold in.
   *
   * Left out, or one row, is the ordinary product: one thing sold one way,
   * exactly the payload this method has always sent. Two or more makes it a
   * VARIABLE product, which is the server's own word for it — `type` governs
   * how many variants a product may have, and sending several against SIMPLE
   * is refused with SIMPLE_PRODUCT_CANNOT_HAVE_VARIANTS.
   *
   * Each carries its OWN prices and SKU, because two sizes are two things on
   * a shelf: they are counted apart, scanned apart and charged apart.
   */
  variants?: ProductVariantInput[];
}

/** A variant as the API just created it — what opening stock is counted against. */
export interface CreatedVariant {
  id: string;
  name: string;
  sku: string;
}

/** What `createProduct` answers with: the list row, plus every variant made. */
export type CreatedProduct = InventoryProduct & { variants: CreatedVariant[] };

/** One sellable form of a product — "500ml", "Red / Large". */
export interface ProductVariantInput {
  /** What distinguishes it. "Default" for a product sold only one way. */
  name: string;
  sku?: string;
  /** What the customer is charged for THIS one. */
  sellingPrice?: number;
  /** What the shop paid for THIS one. */
  purchasePrice?: number;
  /** The code on THIS one's packet. Sizes carry different numbers. */
  barcode?: string;
  /** The one a barcode-less lookup resolves to. Exactly one must be true. */
  isDefault?: boolean;
}

/**
 * The `variants` list to POST, from either shape of payload.
 *
 * One product sold one way is still one row called "Default" — the payload
 * this has always sent, unchanged, so the CSV import, the demo seeder and
 * every existing caller keep working. A payload carrying its own variants
 * sends those instead, each with its own SKU and prices.
 *
 * Exactly one is marked default whatever the caller asked for: the server
 * nominates the first when nobody does, and two defaults would make a
 * barcode-less lookup ambiguous. The first wins, which is the order the form
 * lists them in.
 */
function variantRows(payload: CreateProductPayload): Record<string, unknown>[] {
  const supplied = (payload.variants ?? []).filter((v) => v.name.trim().length > 0);
  if (supplied.length === 0) {
    return [
      {
        name: "Default",
        is_default: true,
        ...(payload.sku ? { sku: payload.sku } : {}),
        ...(payload.purchasePrice != null ? { cost_price: payload.purchasePrice } : {}),
      },
    ];
  }
  const defaultAt = Math.max(
    0,
    supplied.findIndex((v) => v.isDefault)
  );
  return supplied.map((v, index) => ({
    name: v.name.trim(),
    is_default: index === defaultAt,
    ...(v.sku?.trim() ? { sku: v.sku.trim() } : {}),
    ...(v.purchasePrice != null ? { cost_price: v.purchasePrice } : {}),
    // Zero is not a price, it is an unpriced variant — the same rule the
    // top-level `price` follows above.
    ...(v.sellingPrice != null && v.sellingPrice > 0
      ? { selling_price: v.sellingPrice }
      : {}),
    ...(v.barcode?.trim() ? { barcode: v.barcode.trim() } : {}),
  }));
}

/** One row of an import, as the server reports it back. */
export interface ImportRow {
  line: number;
  status: "created" | "error";
  name: string;
  sku: string | null;
  code?: string;
  message?: string;
}

/**
 * What a dry run or a real import produced.
 *
 * `created` is always 0 for a dry run — the run happens inside a transaction
 * that is rolled back, so "would have created" is what `valid` counts.
 */
export interface ImportReport {
  dryRun: boolean;
  total: number;
  valid: number;
  created: number;
  failed: number;
  rows: ImportRow[];
}

/**
 * How much of each product an export writes.
 *
 * `full` is every column — a backup, and the template for a bulk add.
 * `simple` is name, category, unit, sku and price: a short list for reading,
 * and still an importable one. The server owns the column sets; this is only
 * the name of the choice.
 */
export type ExportScope = "full" | "simple";

export class InventoryService {
  /**
   * Fetch inventory products catalog with search & filters
   */
  /**
   * The catalogue rows themselves, before anything decides what a ROW means.
   *
   * Shared by `getProducts` (one row per product) and `getVariants` (one per
   * variant): the request and its paging are identical, and only the mapping
   * differs. Two copies of this drifted the last time a filter was added to
   * one of them.
   */
  private static async rawProducts(
    params?: InventoryQueryFilter
  ): Promise<{ data: any[]; total: number; offset: number }> {
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

    return { data: rows.data, total: rows.total, offset };
  }

  /** Fetch inventory products catalog with search & filters — one per PRODUCT. */
  static async getProducts(
    params?: InventoryQueryFilter
  ): Promise<{ data: InventoryProduct[]; total: number }> {
    const rows = await InventoryService.rawProducts(params);
    return {
      data: rows.data.map((row: any, i: number) =>
        toInventoryProduct(row, rows.offset + i + 1)
      ),
      total: rows.total,
    };
  }

  /**
   * The catalogue as SELLABLE UNITS — one row per variant.
   *
   * What a purchase line, a transfer line and a stock count are each picking:
   * every one of them names a variant. Those pickers were built on
   * `getProducts`, which returns one row per product carrying the DEFAULT
   * variant — so a product sold in three sizes could only ever be bought,
   * moved or counted as one of them.
   *
   * `total` stays the server's PRODUCT count, as the POS list does: it is what
   * the pager pages through, and reporting the expanded row count would make
   * the last page arrive early and leave rows unreachable.
   */
  static async getVariants(
    params?: InventoryQueryFilter
  ): Promise<{ data: InventoryProduct[]; total: number }> {
    const rows = await InventoryService.rawProducts(params);
    let index = 0;
    return {
      data: rows.data.flatMap((row: any) => {
        const made = toInventoryVariants(row, index + 1);
        index += made.length;
        return made;
      }),
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
  static async createProduct(payload: CreateProductPayload): Promise<CreatedProduct> {
    const rows = variantRows(payload);
    const created = await apiFetch<any>("/products/", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        category: payload.categoryId,
        unit: payload.unitId,
        ...(payload.brandId ? { brand: payload.brandId } : {}),
        ...(payload.taxId ? { tax: payload.taxId } : {}),
        ...(payload.reorderLevel != null ? { reorder_level: payload.reorderLevel } : {}),
        /**
         * The top-level conveniences, ONLY for the one-variant product.
         *
         * `price`, `sku` and `barcode` each land on the default variant, so
         * with a variants list they are a second, quieter way to set what the
         * rows already say — and the rows are the ones on screen. Sending both
         * is how the two come to disagree: the server prefers a row's own
         * figure, so a stale top-level price sat in the payload doing nothing
         * until the day a row arrived without one.
         */
        ...(rows.length > 1
          ? {}
          : {
              ...(payload.barcode ? { barcode: payload.barcode } : {}),
              // A row saying 0 is a product the till will sell for nothing —
              // which reads exactly like a product nobody has priced, and is
              // not.
              ...(payload.sellingPrice != null && payload.sellingPrice > 0
                ? { price: payload.sellingPrice }
                : {}),
            }),
        /**
         * `type` is what governs how many variants a product may have —
         * SIMPLE means exactly one and the server refuses a second with
         * SIMPLE_PRODUCT_CANNOT_HAVE_VARIANTS. So it is derived from the
         * payload rather than asked for on the form: a shopkeeper adding a
         * second size is telling us this is a VARIABLE product, and making
         * them also pick the word out of a dropdown is asking the same
         * question twice.
         */
        ...(rows.length > 1 ? { type: "VARIABLE" } : {}),
        // Spelled out rather than left to the `sku` convenience, because that
        // shortcut has nowhere to put a cost price or a second variant.
        variants: rows,
      }),
    });
    /**
     * Every variant that was created, not just the default.
     *
     * The caller needs them to count OPENING STOCK, which is per variant: a
     * product created with 250ml, 500ml and 1L has three shelves to count,
     * and `InventoryProduct` carries only the default's id. Returned in the
     * order the API created them, which is the order they were sent.
     */
    return {
      ...toInventoryProduct(created, 1),
      variants: (Array.isArray(created?.variants) ? created.variants : []).map((v: any) => ({
        id: String(v?.id ?? ""),
        name: String(v?.name ?? ""),
        sku: String(v?.sku ?? ""),
      })),
    };
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
    if (!put.ok) {
      /**
       * Say WHICH thing was wrong, not just the number.
       *
       * The bare status read as "the upload endpoint is missing" and sent
       * people looking at the API, when a 404 here can only mean the BUCKET
       * does not exist — which is what happened when the project was renamed
       * and `AWS_STORAGE_BUCKET_NAME` no longer matched the bucket in the
       * volume. Every product image upload failed with `404` and nothing on
       * screen named the cause.
       */
      const reason =
        put.status === 404
          ? "the storage bucket does not exist — check AWS_STORAGE_BUCKET_NAME"
          : put.status === 403
            ? "the storage rejected the signature — check the endpoint, key and region"
            : `the storage answered ${put.status}`;
      throw new Error(`The image could not be stored: ${reason}.`);
    }

    await apiFetch<unknown>(`/products/${productId}/images/${imageId}/confirm/`, {
      method: "POST",
    });
  }
  /**
   * Send a CSV to the importer.
   *
   * `dryRun` first, always, from the screen's point of view: the server runs
   * the SAME code path either way — a dry run is a real import inside a
   * transaction it rolls back — so a clean dry run is a promise the real one
   * keeps. Showing the report before writing is the whole value of that.
   */
  static async importCsv(file: File, { dryRun }: { dryRun: boolean }): Promise<ImportReport> {
    const form = new FormData();
    form.append("file", file);
    form.append("dry_run", dryRun ? "true" : "false");
    return apiUpload<ImportReport>("/products/import/", form);
  }

  /**
   * Download the catalogue as CSV, honouring the filters on screen.
   *
   * The same query the list is showing, so "Export" means "export this" rather
   * than "export something else" — a button that quietly exports the whole
   * catalogue while the screen shows a search is a button that lies.
   *
   * `scope` picks how much of each product is written. BOTH are valid import
   * files: the short one still carries name, category and unit, because the
   * importer requires those three and an export that cannot be fed back in
   * would be a trap rather than a smaller file.
   */
  static async exportCsv(
    params?: InventoryQueryFilter & { search?: string },
    { scope = "full" }: { scope?: ExportScope } = {}
  ): Promise<void> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.category) query.set("category", params.category);
    if (params?.status) query.set("status", params.status);
    query.set("scope", scope);
    const qs = query.toString() ? `?${query.toString()}` : "";

    // Named for what is in it. Two files in a downloads folder both called
    // products.csv are indistinguishable, and the short one is the one
    // somebody re-imports by mistake.
    const fallback = scope === "simple" ? "products-simple.csv" : "products.csv";
    const { blob, filename } = await apiDownload(`/products/export/${qs}`, fallback);
    saveBlob(blob, filename);
  }

  /** Wording a shopkeeper can act on, for the import and export paths. */
  static describeFileError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      if (error.status === 403) return "You do not have permission to do that.";
      if (error.status === 413) return "That file is too large.";
      const field = Object.values(error.errors || {})[0];
      if (Array.isArray(field) && field.length) return String(field[0]);
      return error.message;
    }
    return "That did not work.";
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

/**
 * The units a shop sells in — pieces, metres, kilograms.
 *
 * Its own service rather than another `CatalogKind`, because a unit is not a
 * plain named lookup: it carries the short name that prints beside a quantity
 * and the flag that decides whether a fraction of it can be sold at all.
 * `UnitService.validate_quantity` on the server refuses 2.5 pieces; this is
 * where a shop says which of its units are like that.
 */
export interface UnitOption {
  id: string;
  name: string;
  /** "pcs", "m", "kg" — what prints beside the number. */
  shortName: string;
  /** Whether half of one can be sold. Cloth yes, bottles no. */
  allowDecimal: boolean;
}

export class UnitsService {
  static async list(): Promise<UnitOption[]> {
    const res = await apiList<any>("/units/?limit=200", { method: "GET" }, (r) => r);
    return res.data
      .filter((r: any) => r?.id)
      .map((r: any) => ({
        id: String(r.id),
        name: String(r?.name ?? ""),
        shortName: String(r?.shortName ?? r?.short_name ?? ""),
        allowDecimal: (r?.allowDecimal ?? r?.allow_decimal ?? false) === true,
      }))
      .sort((a: UnitOption, b: UnitOption) => a.name.localeCompare(b.name));
  }

  static async create(input: Omit<UnitOption, "id">): Promise<void> {
    await apiFetch("/units/", {
      method: "POST",
      body: JSON.stringify({
        name: input.name.trim(),
        short_name: input.shortName.trim(),
        allow_decimal: input.allowDecimal,
      }),
    });
    invalidate("inventory", "units", "pos-products");
  }

  static async update(id: string, input: Omit<UnitOption, "id">): Promise<void> {
    await apiFetch(`/units/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        name: input.name.trim(),
        short_name: input.shortName.trim(),
        allow_decimal: input.allowDecimal,
      }),
    });
    // The till prints the short name beside every quantity, so a rename has to
    // reach the product wall as well as this screen.
    invalidate("inventory", "units", "pos-products");
  }

  static async remove(id: string): Promise<void> {
    // The API refuses one that products still point at, and that refusal is
    // the useful answer — passed through rather than pre-empted with a count
    // this screen would have to keep in step.
    await apiFetch(`/units/${id}/`, { method: "DELETE" });
    invalidate("inventory", "units", "pos-products");
  }
}
