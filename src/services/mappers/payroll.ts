import { PayrollRecord } from "@/types/payroll";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";

/**
 * A payroll run -> one table row per payslip.
 *
 * The API nests payslips inside runs; the table is a flat list of people.
 * Paid or not is a property of the run, not the payslip, so every row in a run
 * shares it: POSTED reads as Paid, anything else as Pending.
 */

export interface PayrollRun {
  id: string;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  payslips?: any[];
}

function statusOf(run: string | undefined): PayrollRecord["status"] {
  return String(run || "").toUpperCase() === "POSTED" ? "Paid" : "Pending";
}

export function toPayrollRows(runs: PayrollRun[]): PayrollRecord[] {
  const rows: PayrollRecord[] = [];
  for (const run of runs) {
    const status = statusOf(run.status);
    for (const slip of run.payslips || []) {
      const basicSalary = toAmount(slip?.basicSalary);
      const allowances = toAmount(slip?.allowances);
      const deductions = toAmount(slip?.deductions);
      const netSalary = toAmount(slip?.netPay);
      rows.push({
        id: String(slip?.id ?? ""),
        // Only a draft run can be corrected; a posted one is in the ledger.
        editable: String(run.status || "").toUpperCase() === "DRAFT",
        index: String(rows.length + 1).padStart(2, "0"),
        // The server has no employee photo, so the table shows initials.
        employee: { name: String(slip?.employeeName || "—"), avatar: "" },
        basicSalary,
        basicSalaryFormatted: formatMoney(basicSalary),
        allowances,
        allowancesFormatted: formatMoney(allowances),
        deductions,
        deductionsFormatted: formatMoney(deductions),
        netSalary,
        netSalaryFormatted: formatMoney(netSalary),
        status,
      });
    }
  }
  return rows;
}
