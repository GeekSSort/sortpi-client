import { PayrollRecord, PayrollQueryFilter } from "@/types/payroll";
import { apiFetch, apiList, ApiError, PagedResult } from "./apiClient";
import { PayrollRun, toPayrollRows } from "./mappers/payroll";
import { HrmService } from "./hrmService";
import { formatMoney } from "@/lib/format";

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

    // The month is filtered by the SERVER now. This used to pull a hundred runs
    // and slice them here, so every month a company had ever run arrived in one
    // list and the hundred-and-first was invisible.
    const qs = params?.month ? `&month=${encodeURIComponent(params.month)}` : "";
    const runs = await apiList<PayrollRun>(
      `/hrm/payroll-runs/?limit=100${qs}`,
      { method: "GET" },
      (r) => r as PayrollRun
    );

    let rows = toPayrollRows(runs.data);

    /**
     * A month nobody has run yet still has wages owed on it.
     *
     * The screen showed "No payroll run for September 2026" and stopped, so
     * the one question a shop asks at the end of a month — who still has to be
     * paid — had no answer until somebody pressed a button first. These are
     * the ACTIVE roster's own figures, exactly what a run would calculate, and
     * they carry `preview` so a row can say it has no payslip behind it yet.
     *
     * Only when the month is genuinely empty: a run that exists is the truth
     * about that month, including a run somebody deliberately made for nobody.
     */
    if (rows.length === 0 && params?.month) {
      rows = await PayrollService.previewMonth(params.month);
    }
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

  /**
   * What a month's payroll WOULD be, from the roster.
   *
   * Never written anywhere and never counted as money — nothing here posts.
   * It exists so an unrun month lists who is owed instead of an empty table,
   * and every row is `preview`, which is what stops the screen offering to
   * edit a payslip that does not exist.
   */
  private static async previewMonth(month: string): Promise<PayrollRecord[]> {
    const { start, end } = PayrollService.boundsOfMonth(month);
    const roster = await HrmService.getRoster({ active: true, page: 1, limit: 200 });

    // Filtered HERE as well as asked for, because the employees endpoint has
    // no `is_active` filter — it takes search, department, attendance status
    // and day, and ignores anything else. So the request above is a no-op and
    // an unrun month would list everybody who has ever worked here, including
    // the people who left.
    return roster.data
      .filter((employee) => employee.isActive)
      .map((employee, i) => {
        const basic = employee.basicSalary ?? 0;
        const allowances = employee.allowances ?? 0;
        const deductions = employee.deductions ?? 0;
        const net = basic + allowances - deductions;
        return {
          id: `preview:${employee.id}`,
          preview: true,
          periodStart: start,
          periodEnd: end,
          // There is no payslip to correct yet.
          editable: false,
          index: String(i + 1).padStart(2, "0"),
          employee: { name: employee.name, avatar: "" },
          basicSalary: basic,
          basicSalaryFormatted: formatMoney(basic),
          allowances,
          allowancesFormatted: formatMoney(allowances),
          deductions,
          deductionsFormatted: formatMoney(deductions),
          netSalary: net,
          netSalaryFormatted: formatMoney(net),
          status: "Not Paid" as const,
        };
    });
  }

  /**
   * Settle one person's wage.
   *
   * Writes the salary expense and BOTH its ledger legs on the server, so the
   * money lands on the Income & Expense screen and the P&L in the same call —
   * there is nothing for the client to post afterwards.
   */
  static async payPayslip(payslipId: string): Promise<void> {
    await apiFetch(`/hrm/payslips/${payslipId}/pay/`, { method: "POST" });
  }

  /**
   * The months that have a payroll run, newest first, as "YYYY-MM".
   *
   * So the switcher can offer them rather than making somebody step back
   * through empty screens with no way to know when to stop.
   */
  static async months(): Promise<string[]> {
    const res = await apiFetch<any>("/hrm/payroll-runs/months/", { method: "GET" });
    const rows = Array.isArray(res?.months) ? res.months : [];
    return rows.map((m: unknown) => String(m)).filter(Boolean);
  }

  /** First and last day of a "YYYY-MM" month, as the run endpoint wants them. */
  static boundsOfMonth(month: string): { start: string; end: string } {
    const [y, m] = month.split("-").map(Number);
    return PayrollService.monthBounds(new Date(y, m - 1, 1));
  }

  /** "2026-09" for a date — the key the filter and the switcher both use. */
  static monthKey(when: Date = new Date()): string {
    return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}`;
  }

  /** "September 2026", for a person to read. */
  static monthLabel(month: string): string {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return month;
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }

  /** The month `step` months away from `month`, as "YYYY-MM". */
  static shiftMonth(month: string, step: number): string {
    const [y, m] = month.split("-").map(Number);
    return PayrollService.monthKey(new Date(y, m - 1 + step, 1));
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
  /**
   * Calculate a month's payroll.
   *
   * `payNow` defaults FALSE here: calculating a month and paying it are two
   * events, often days apart, and running them together meant a shop could
   * never see who was still owed — every payslip existed only after the money
   * had already left the drawer. The run lands as a set of unpaid payslips and
   * `payPayslip` settles them one at a time.
   */
  static async runPayroll(
    periodStart: string,
    periodEnd: string,
    payNow = false
  ): Promise<void> {
    await apiFetch("/hrm/payroll-runs/run/", {
      method: "POST",
      body: JSON.stringify({
        period_start: periodStart,
        period_end: periodEnd,
        pay_now: payNow,
      }),
    });
  }

  /** First and last day of the month a date falls in, as "YYYY-MM-DD". */
  /**
   * The first and last day of a month, as the run endpoint wants them.
   *
   * Formatted from the LOCAL parts, not through `toISOString()`.
   * `new Date(2026, 8, 1)` is local midnight, and in any zone ahead of UTC
   * that is the previous day in UTC — so in Dhaka (+6) September's period ran
   * from 2026-08-31 to 2026-09-29. Both ends were wrong: the start overlapped
   * August's posted run and the server refused the whole thing with "already
   * posted and overlaps this period", and the end silently dropped the last
   * day of the month from every payroll period.
   */
  static monthBounds(when: Date = new Date()): { start: string; end: string } {
    const day = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    return {
      start: day(new Date(when.getFullYear(), when.getMonth(), 1)),
      end: day(new Date(when.getFullYear(), when.getMonth() + 1, 0)),
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
