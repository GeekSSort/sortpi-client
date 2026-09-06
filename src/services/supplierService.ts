import { SupplierRecord, SupplierQueryFilter, CreateSupplierPayload } from "@/types/suppliers";
import { initialSuppliersData } from "@/lib/services/suppliers.service";
import { apiFetch, apiList } from "./apiClient";
import { toSupplierRecord } from "./mappers/supplier";

export class SupplierService {
  /**
   * Fetch suppliers with search & filters
   */
  static async getSuppliers(params?: SupplierQueryFilter): Promise<{ data: SupplierRecord[]; total: number }> {
    const fallback = () => {
      let list = [...initialSuppliersData];
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.phone.includes(q) ||
            s.mail.toLowerCase().includes(q)
        );
      }
      if (params?.status) {
        list = list.filter((s) => s.status.toLowerCase() === params.status?.toLowerCase());
      }
      return {
        data: list,
        total: list.length,
      };
    };

    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    // One request. The purchase total and the last purchase date are annotated
    // onto the row by the API; this used to fetch the whole purchase list
    // alongside and add it up here, which was both a second full request per
    // page load and wrong past the 200-row cap.
    const rows = await apiList<any>(`/suppliers/${qs}`, { method: "GET" }, fallback, (r) => r);

    // Already-mapped fallback rows carry `mail`; nothing to map.
    if (rows.data[0]?.mail !== undefined) return rows as { data: SupplierRecord[]; total: number };

    return {
      data: rows.data.map((row: any, i: number) => toSupplierRecord(row, i + 1)),
      total: rows.total,
    };
  }

  /**
   * Add a supplier.
   *
   * The API needs a `code` and does not make one up, and it names the address
   * field `email` rather than `mail`. The old version sent the screen's own
   * shape with no code at all, so the request was refused and the fallback
   * pushed the row into an in-memory array — the add flow looked like it
   * round-tripped while the server never heard about it.
   *
   * No fallback here: a failure has to reach the form.
   */
  static async createSupplier(payload: CreateSupplierPayload): Promise<SupplierRecord> {
    const code = await nextSupplierCode();
    const created = await apiFetch<any>("/suppliers/", {
      method: "POST",
      body: JSON.stringify({
        code,
        name: payload.name,
        phone: payload.phone || "",
        email: payload.mail || "",
        is_active: payload.status !== "Inactive",
      }),
    });
    return toSupplierRecord(created, 1);
  }
}

/**
 * The next free supplier code, as SUP-051.
 *
 * Counted from the list, so two people adding a supplier at the same moment can
 * collide. The server refuses a duplicate rather than writing one, so the
 * second person sees an error instead of a mess — but a code minted by the
 * server is the real answer. Same shortcoming as the customer side.
 */
async function nextSupplierCode(): Promise<string> {
  const rows = await apiList<any>(
    "/suppliers/?limit=200",
    { method: "GET" },
    { data: [], total: 0 },
    (r) => r
  ).catch(() => ({ data: [] as any[] }));
  let highest = 0;
  for (const row of rows.data) {
    const found = /(\d+)\s*$/.exec(String(row?.code ?? ""));
    if (found) highest = Math.max(highest, Number(found[1]));
  }
  return `SUP-${String(highest + 1).padStart(3, "0")}`;
}
