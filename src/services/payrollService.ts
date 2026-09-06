import { PayrollRecord, PayrollQueryFilter } from "@/types/payroll";
import { apiFetch, apiList, ApiError, PagedResult } from "./apiClient";
import { PayrollRun, toPayrollRows } from "./mappers/payroll";

/**
 * Payslips, read through payroll runs.
 *
 * `/hrm/payroll-runs/` is the only payroll list the API offers and it pages by
 * run, not by person, so the rows are flattened here and searched, filtered and
 * paged in the browser — the same trade the employees table makes.
 */
export class PayrollService {
  static async getPayroll(params?: PayrollQueryFilter): Promise<PagedResult<PayrollRecord>> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 8;

    const runs = await apiList<PayrollRun>(
      "/hrm/payroll-runs/?limit=100",
      { method: "GET" },
      { data: [], total: 0 },
      (r) => r as PayrollRun
    );

    const rows = toPayrollRows(runs.data);
    const needle = params?.search?.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (params?.status && r.status.toLowerCase() !== params.status.toLowerCase()) return false;
      if (!needle) return true;
      return r.employee.name.toLowerCase().includes(needle);
    });

    const offset = (page - 1) * limit;
    return {
      data: filtered.slice(offset, offset + limit),
      total: filtered.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    };
  }

  /** Correct the figures on one payslip; the server re-derives net pay. */
  static async updatePayslip(
    id: string,
    values: { basicSalary: number; allowances: number; deductions: number }
  ): Promise<void> {
    await apiFetch(`/hrm/payslips/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        basic_salary: String(values.basicSalary),
        allowances: String(values.allowances),
        deductions: String(values.deductions),
      }),
    });
  }

  /** Pay everyone for a period. The server builds one payslip per employee. */
  static async runPayroll(periodStart: string, periodEnd: string): Promise<void> {
    await apiFetch("/hrm/payroll-runs/run/", {
      method: "POST",
      body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
    });
  }

  /** First and last day of the month a date falls in, as "YYYY-MM-DD". */
  static monthBounds(when: Date = new Date()): { start: string; end: string } {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return {
      start: iso(new Date(when.getFullYear(), when.getMonth(), 1)),
      end: iso(new Date(when.getFullYear(), when.getMonth() + 1, 0)),
    };
  }

  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "PAYROLL_RUN_POSTED") return error.message;
      if (error.code === "SALARY_ACCOUNT_NOT_FOUND") {
        return "No salary expense account (5200) is set up for this company.";
      }
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      const field = Object.values(error.errors || {})[0];
      if (Array.isArray(field) && field.length) return String(field[0]);
      return error.message;
    }
    return "Something went wrong. Please try again.";
  }
}
