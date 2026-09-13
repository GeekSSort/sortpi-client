import { CustomerRecord, CustomerQueryFilter, CreateCustomerPayload } from "@/types/customer";
import { apiFetch, apiList, toAmount } from "./apiClient";
import { toCustomerRecord } from "./mappers/customer";

export class CustomerService {
  /**
   * Fetch customer directory with search & filters
   */
  static async getCustomers(params?: CustomerQueryFilter): Promise<{ data: CustomerRecord[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.customerType) searchParams.set("customer_type", params.customerType);
    if (params?.hasDue) searchParams.set("has_due", "1");
    if (params?.page) searchParams.set("page", String(params.page));
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    // One request. The order count and the lifetime total are annotated onto
    // the row by the API; this used to fetch the whole sales list alongside
    // and add it up here, which was both a second full request per page load
    // and wrong past the 200-row cap.
    const rows = await apiList<any>(`/customers/${qs}`, { method: "GET" }, (r) => r);

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
    note = "",
    options: {
      /** Which invoices this money settles, and by how much. Amounts POSITIVE. */
      allocations?: { saleId: string; amount: number }[];
      /** How it was paid, so the ledger debits the account it moved through. */
      paymentMethod?: string;
      /**
       * One key for one PAYMENT, not one per attempt.
       *
       * The default is `Date.now()`, which makes every retry a new payment —
       * fine for a button pressed once, wrong for a dialog that can be
       * double-tapped. A caller that mints a key when the dialog opens gets
       * the at-most-once guarantee the header exists for; these ledgers are
       * insert-only, so a double post is corrected by hand or not at all.
       */
      idempotencyKey?: string;
    } = {}
  ): Promise<{ balanceAfter: number }> {
    const row = await apiFetch<any>(`/customers/${customerId}/payments/`, {
      method: "POST",
      idempotencyKey: options.idempotencyKey ?? `pay-${customerId}-${Date.now()}`,
      body: JSON.stringify({
        // A STRING, never a JSON number. `apiClient` documents the rule in the
        // other direction — Decimal crosses the API as a string — and it holds
        // on the way out too: `JSON.stringify(1234.5)` is a float, and DRF's
        // DecimalField would build its Decimal from one.
        amount: amount.toFixed(4),
        reference_type: "PAYMENT",
        note,
        ...(options.paymentMethod ? { payment_method: options.paymentMethod } : {}),
        // Sent only when there are any, so a payment ON ACCOUNT hashes exactly
        // as it did before allocation existed and every key already issued
        // still replays.
        ...(options.allocations?.length
          ? {
              allocations: options.allocations.map((a) => ({
                sale_id: a.saleId,
                amount: a.amount.toFixed(4),
              })),
            }
          : {}),
      }),
    });
    return { balanceAfter: toAmount(row?.balanceAfter ?? row?.balance_after) };
  }

  /**
   * This customer's invoices, and what each one STILL owes.
   *
   * `outstanding` is derived from the ledger — charged, less returns, less
   * every payment and allocation — and is NOT the `due_amount` on the sale
   * row, which is what was owed the day it was rung up and never moves again.
   * Allocating against that column would offer to settle money a return has
   * already credited back.
   *
   * Oldest first, which is the order a payment is applied in.
   */
  /** One customer, by id. The list row shape, for a detail page's header. */
  static async getCustomer(customerId: string): Promise<CustomerRecord> {
    const row = await apiFetch<any>(`/customers/${customerId}/`, { method: "GET" });
    return toCustomerRecord(row);
  }

  static async getInvoices(
    customerId: string,
    { includeSettled = false } = {}
  ): Promise<CustomerInvoice[]> {
    const rows = await apiFetch<any>(
      `/customers/${customerId}/invoices/${includeSettled ? "?all=true" : ""}`,
      { method: "GET" }
    );
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: String(row?.id ?? ""),
      invoiceNumber: String(row?.invoiceNumber ?? row?.invoice_number ?? ""),
      saleDate: String(row?.saleDate ?? row?.sale_date ?? ""),
      branchName: String(row?.branchName ?? row?.branch_name ?? ""),
      grandTotal: toAmount(row?.grandTotal ?? row?.grand_total),
      paidAmount: toAmount(row?.paidAmount ?? row?.paid_amount),
      outstanding: toAmount(row?.outstanding),
    }));
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
  const rows = await apiList<any>("/customers/?limit=500", { method: "GET" }, (r) => r)
    .catch(() => ({ data: [] as any[] }));
  let highest = 0;
  for (const row of rows.data) {
    const found = /(\d+)\s*$/.exec(String(row?.code ?? ""));
    if (found) highest = Math.max(highest, Number(found[1]));
  }
  return `CUS-${String(highest + 1).padStart(3, "0")}`;
}

/** One of a customer's invoices, as the detail page shows it. */
export interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  branchName: string;
  grandTotal: number;
  paidAmount: number;
  /** Still owed, from the ledger. Zero means settled. */
  outstanding: number;
}
