import { CustomerRecord, CustomerQueryFilter, CreateCustomerPayload } from "@/types/customer";
import { initialCustomersData } from "@/lib/services/customer.service";
import { apiFetch, apiList, toAmount } from "./apiClient";
import { toCustomerRecord } from "./mappers/customer";

export class CustomerService {
  /**
   * Fetch customer directory with search & filters
   */
  static async getCustomers(params?: CustomerQueryFilter): Promise<{ data: CustomerRecord[]; total: number }> {
    const fallback = () => {
      let list = [...initialCustomersData];
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.customerId.toLowerCase().includes(q) ||
            c.phone.includes(q)
        );
      }
      if (params?.customerType) {
        // The sample rows carry the screen's names, the filter the API's two.
        const wanted = params.customerType === "WHOLESALE" ? "premium" : "regular";
        list = list.filter((c) => c.type.toLowerCase() === wanted);
      }
      if (params?.status) {
        list = list.filter((c) => c.status.toLowerCase() === params.status?.toLowerCase());
      }
      return { data: list, total: list.length };
    };

    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.customerType) searchParams.set("customer_type", params.customerType);
    if (params?.page) searchParams.set("page", String(params.page));
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    // One request. The order count and the lifetime total are annotated onto
    // the row by the API; this used to fetch the whole sales list alongside
    // and add it up here, which was both a second full request per page load
    // and wrong past the 200-row cap.
    const rows = await apiList<any>(`/customers/${qs}`, { method: "GET" }, fallback, (r) => r);

    // Already-mapped fallback rows carry `customerId`; nothing to map.
    if (rows.data[0]?.customerId !== undefined) {
      return rows as { data: CustomerRecord[]; total: number };
    }

    return {
      data: rows.data.map((row: any) => toCustomerRecord(row)),
      total: rows.total,
    };
  }

  /**
   * Record a payment against what a customer owes.
   *
   * `POST /customers/{id}/payments/` — the amount is POSITIVE and the server
   * owns the sign, so a cashier never types a negative to reduce a balance.
   * The idempotency key matters: these ledgers are insert-only, and a retried
   * request without one posts the payment twice with no way to undo it but a
   * manual reversing entry.
   */
  static async recordPayment(
    customerId: string,
    amount: number,
    note = ""
  ): Promise<{ balanceAfter: number }> {
    const row = await apiFetch<any>(`/customers/${customerId}/payments/`, {
      method: "POST",
      idempotencyKey: `pay-${customerId}-${Date.now()}`,
      body: JSON.stringify({ amount, reference_type: "PAYMENT", note }),
    });
    return { balanceAfter: toAmount(row?.balanceAfter ?? row?.balance_after) };
  }

  /**
   * Create new customer
   */
  /**
   * Add a customer.
   *
   * The API needs a `code` and it does not make one up: without it the whole
   * request is refused, which is why the POS add-customer box returned 400.
   * The next free code is worked out from the ones already there.
   *
   * It also names the field `customer_type` and only accepts RETAIL or
   * WHOLESALE, so the screen's Regular / VIP / Premium is mapped on the way
   * out. A code the server generated would be safer than one counted here, and
   * that is in the report.
   */
  static async createCustomer(payload: CreateCustomerPayload): Promise<CustomerRecord> {
    const code = await nextCustomerCode();
    const created = await apiFetch<any>("/customers/", {
      method: "POST",
      body: JSON.stringify({
        code,
        name: payload.name,
        phone: payload.phone || "",
        email: payload.email || "",
        // The API has two kinds of customer; the screen shows three names.
        customer_type: payload.type === "Premium" ? "WHOLESALE" : "RETAIL",
        is_active: payload.status !== "Inactive",
      }),
    });
    return toCustomerRecord(created);
  }

}

/**
 * The next free customer code, as CUS-051.
 *
 * Counted from the list, so two tills adding somebody at the same moment can
 * collide. The server refuses a duplicate rather than writing one, so the
 * second person sees an error instead of a mess - but a code minted by the
 * server is the real answer.
 */
async function nextCustomerCode(): Promise<string> {
  const rows = await apiList<any>("/customers/?limit=500", { method: "GET" }, { data: [], total: 0 }, (r) => r)
    .catch(() => ({ data: [] as any[] }));
  let highest = 0;
  for (const row of rows.data) {
    const found = /(\d+)\s*$/.exec(String(row?.code ?? ""));
    if (found) highest = Math.max(highest, Number(found[1]));
  }
  return `CUS-${String(highest + 1).padStart(3, "0")}`;
}
