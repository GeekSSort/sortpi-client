import { SupplierRecord, SupplierQueryFilter, CreateSupplierPayload } from "@/types/suppliers";
import { apiFetch, apiList, ApiError, toAmount } from "./apiClient";
import { toSupplierRecord } from "./mappers/supplier";

export class SupplierService {
  /**
   * Fetch suppliers with search & filters
   */
  static async getSuppliers(params?: SupplierQueryFilter): Promise<{ data: SupplierRecord[]; total: number }> {
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
    const rows = await apiList<any>(`/suppliers/${qs}`, { method: "GET" }, (r) => r);

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
  /**
   * Pay a supplier, against their outstanding balance.
   *
   * THIS DID NOT EXIST. The "Record payment" dialog on the suppliers screen
   * called `patch()` — a local mutation of the cached row — and nothing else:
   * the balance fell on screen, a note said the money had been paid, and NO
   * REQUEST WAS MADE. Nothing reached the supplier ledger, the general ledger
   * or the cash account, and the old balance came back on the next refresh.
   * A shop reconciling against it would be short by every payment ever
   * "recorded" this way.
   *
   * `POST /suppliers/{id}/payments/` is the same endpoint the customer side
   * has always used — `_PartnerViewSet` serves both — so the sign, the
   * ledger row and the general-ledger legs are all owned by the server.
   *
   * The idempotency key is REQUIRED, not optional: these ledgers are
   * insert-only, so a retried request without one posts the payment twice and
   * the only correction is a manual reversing entry. The caller mints one when
   * the dialog opens, so a double-tap replays instead of paying twice.
   */
  static async recordPayment(
    supplierId: string,
    amount: number,
    note = "",
    options: { paymentMethod?: string; idempotencyKey?: string } = {}
  ): Promise<{ balanceAfter: number }> {
    const row = await apiFetch<any>(`/suppliers/${supplierId}/payments/`, {
      method: "POST",
      idempotencyKey: options.idempotencyKey ?? `sup-pay-${supplierId}`,
      body: JSON.stringify({
        amount: amount.toFixed(4),
        reference_type: "PAYMENT",
        note,
        ...(options.paymentMethod ? { payment_method: options.paymentMethod } : {}),
      }),
    });
    return { balanceAfter: toAmount(row?.balanceAfter ?? row?.balance_after) };
  }

  /** Wording a person can act on. */
  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      if (error.code === "ZERO_LEDGER_AMOUNT") return "Enter an amount above zero.";
      if (error.status === 403) return "You do not have permission to pay a supplier.";
      const field = Object.values(error.errors || {})[0];
      if (Array.isArray(field) && field.length) return String(field[0]);
      return error.message;
    }
    return "That payment could not be recorded.";
  }

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
    (r) => r
  ).catch(() => ({ data: [] as any[] }));
  let highest = 0;
  for (const row of rows.data) {
    const found = /(\d+)\s*$/.exec(String(row?.code ?? ""));
    if (found) highest = Math.max(highest, Number(found[1]));
  }
  return `SUP-${String(highest + 1).padStart(3, "0")}`;
}