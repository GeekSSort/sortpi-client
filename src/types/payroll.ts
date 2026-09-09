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
  status: "Paid" | "Pending";
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

