export interface PayrollRecord {
  id: string;
  index: string;
  employee: {
    name: string;
    avatar: string;
  };
  basicSalary: number;
  basicSalaryFormatted: string;
  allowances: number;
  allowancesFormatted: string;
  deductions: number;
  deductionsFormatted: string;
  netSalary: number;
  netSalaryFormatted: string;
  /**
   * Whether THIS person's wage has left the drawer.
   *
   * Per payslip, not per run. The run's own status used to decide it, so a
   * month was Paid or Pending for everybody at once — a shop settling one
   * person at a time had no way to see who was still owed.
   */
  status: "Paid" | "Not Paid";
  /**
   * True for a row derived from the roster because the month has no run yet.
   *
   * There is no payslip behind it, so it cannot be edited and paying it has to
   * calculate the month first.
   */
  preview?: boolean;
  /** The run's period, as "YYYY-MM-DD". Which month this payslip pays for. */
  periodStart: string;
  periodEnd: string;
  /** Draft-run payslips can be corrected; posted ones are in the ledger. */
  editable?: boolean;
}

export interface PayrollQueryFilter {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  /** One month, as "2026-09". Omit for every month. */
  month?: string;
}

