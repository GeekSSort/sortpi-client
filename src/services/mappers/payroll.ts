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

/**
 * Paid means the money left the drawer for THIS person.
 *
 * `is_paid` is the server's own signal — `Payslip.expense`, set only by the
 * one path that writes an expense and both its ledger legs. It used to be
 * derived from the RUN's status, so a month read Paid or Not Paid for
 * everybody at once and a shop settling person by person could not see who
 * was still owed.
 *
 * The run's status is the fallback for a payslip from before `is_paid`
 * existed: a POSTED run had every wage posted, so its slips are paid.
 */
function statusOf(slip: any, run: string | undefined): PayrollRecord["status"] {
  const paid =
    slip?.isPaid ?? slip?.is_paid ?? (String(run || "").toUpperCase() === "POSTED");
  return paid ? "Paid" : "Not Paid";
}

export function toPayrollRows(runs: PayrollRun[]): PayrollRecord[] {
  const rows: PayrollRecord[] = [];
  for (const run of runs) {
    for (const slip of run.payslips || []) {
      const basicSalary = toAmount(slip?.basicSalary);
      const allowances = toAmount(slip?.allowances);
      const deductions = toAmount(slip?.deductions);
      const netSalary = toAmount(slip?.netPay);
      rows.push({
        id: String(slip?.id ?? ""),
        // Which month this payslip pays for. The table used to show every run
        // a company had ever made, one after another, with nothing on a row to
        // say which was which — the same person and the same salary twice.
        periodStart: String(run.periodStart ?? ""),
        periodEnd: String(run.periodEnd ?? ""),
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
        status: statusOf(slip, run.status),
      });
    }
  }
  return rows;
}
