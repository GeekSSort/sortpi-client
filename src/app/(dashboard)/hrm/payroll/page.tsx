"use client";

import React, { useEffect, useRef, useState } from "react";
import { PayrollRecord } from "@/types/payroll";
import { PayrollService } from "@/services/payrollService";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import { formatMoney } from "@/lib/format";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import RowActionMenu from "@/components/shared/RowActionMenu";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";

/**
 * Payroll — Figma 75:5509.
 *
 * Seven columns fixed at both ends: # 80, Employee 230, four equal money
 * columns, Status 140, then the 83px action column. Rows 54 tall with 12px
 * cells. Search and the filter sit
 * in the headline row, as they do on the other list pages.
 */

const GRID = "grid-cols-[80px_230px_1fr_1fr_1fr_1fr_140px_83px]";
const CELL = "flex items-center px-[12px]";
const HEAD =
  "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e] whitespace-nowrap";
const BODY =
  "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252] whitespace-nowrap";

const MONEY_FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";

const STATUS_TONE: Record<PayrollRecord["status"], Tone> = { Paid: "green", Pending: "gold" };
const FILTERS = ["Payroll", "Paid", "Pending"] as const;

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0">
      <path d="M2.25 4.5h13.5M4.5 9h9m-6.75 4.5h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m5.5 7.75 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M10 4.375v11.25M4.375 10h11.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function PayrollPage() {
  const [rows, setRows] = useState<PayrollRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Payroll");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [period, setPeriod] = useState(() => PayrollService.monthBounds());
  const [reloadKey, setReloadKey] = useState(0);
  const [editOf, setEditOf] = useState<PayrollRecord | null>(null);
  const [form, setForm] = useState({ basicSalary: "", allowances: "", deductions: "" });
  const [saving, setSaving] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await PayrollService.getPayroll({
          search: query || undefined,
          status: filter === "Payroll" ? undefined : filter,
          page,
          limit: pageSize,
        });
        if (cancelled) return;
        setRows(res.data);
        setTotal(res.total);
      } catch (e) {
        if (!cancelled) setNote(PayrollService.describeError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filter, page, pageSize, reloadKey]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFilterOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  /** Open the edit dialog with the row's own figures. */
  const openEdit = (row: PayrollRecord) => {
    setForm({
      basicSalary: String(row.basicSalary),
      allowances: String(row.allowances),
      deductions: String(row.deductions),
    });
    setEditOf(row);
  };

  const saveEdit = async () => {
    if (!editOf) return;
    setSaving(true);
    try {
      await PayrollService.updatePayslip(editOf.id, {
        basicSalary: Number(form.basicSalary) || 0,
        allowances: Number(form.allowances) || 0,
        deductions: Number(form.deductions) || 0,
      });
      setNote(`${editOf.employee.name}'s payroll updated.`);
      setEditOf(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setNote(PayrollService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const runPayroll = async () => {
    setRunning(true);
    try {
      await PayrollService.runPayroll(period.start, period.end);
      setNote(`Payroll run for ${period.start} to ${period.end}.`);
      setRunOpen(false);
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setNote(PayrollService.describeError(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Headline — 75:5511 */}
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:items-center lg:justify-between lg:gap-0">
        <div className="flex h-[44px] w-full items-center justify-between gap-[12px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:w-[370px]">
          <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, ID, email, phone..."
              aria-label="Search payroll"
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
            />
          </div>
          <button
            type="button"
            aria-label="Filter"
            onClick={() => setFilterOpen((v) => !v)}
            className="shrink-0 cursor-pointer text-[#525252] transition-colors hover:text-[#1e1e1e]"
          >
            <FilterIcon />
          </button>
        </div>

        <div className="flex flex-col items-stretch gap-[12px] sm:flex-row sm:items-center sm:gap-[16px]">
          <div ref={filterRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
              className="flex h-[48px] w-full cursor-pointer items-center justify-between gap-[12px] rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[12px] text-[16px] leading-[24px] font-medium whitespace-nowrap text-[#525252] transition-colors hover:bg-[#fafafa] sm:w-auto"
            >
              {filter}
              <CaretIcon open={filterOpen} />
            </button>

            {filterOpen && (
              <ul
                role="listbox"
                className="absolute right-0 z-30 mt-[6px] w-[168px] overflow-hidden rounded-[10px] border border-[#eaeaea] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
              >
                {FILTERS.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={f === filter}
                      onClick={() => {
                        setFilter(f);
                        setPage(1);
                        setFilterOpen(false);
                      }}
                      className={`w-full cursor-pointer px-[14px] py-[9px] text-left text-[14px] transition-colors hover:bg-[#fdf7e6] ${
                        f === filter ? "bg-[#fdf7e6] font-medium text-[#1e1e1e]" : "text-[#525252]"
                      }`}
                    >
                      {f === "Payroll" ? "All payslips" : f}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setPeriod(PayrollService.monthBounds());
              setRunOpen(true);
            }}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            Add New
          </button>
        </div>
      </div>

      {/* Table card — 75:5543 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        {note && (
          <p role="status" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        {/* Table — 75:5560 */}
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1050px]">
              <div className={`grid ${GRID} items-start overflow-clip`}>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>#</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Employee</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Basic Salary</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Allowances</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Deductions</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Net Salary</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Action</span></div>

                {loading && (
                  <div className="col-span-8 px-[12px] py-[28px] text-center text-[14px] text-[#525252]">
                    Loading payroll...
                  </div>
                )}

                {loading && rows.length === 0 && (
                  <TableSkeleton columns={GRID} rows={pageSize} />
                )}
                {!loading && rows.length === 0 && (
                  <div className="col-span-8 px-[12px] py-[28px] text-center text-[14px] text-[#525252]">
                    No payslips yet. Use Add New to run payroll for this month.
                  </div>
                )}

                {!loading &&
                  rows.map((r) => (
                    <React.Fragment key={r.id}>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.index}</span>
                      </div>
                      <div className={`${CELL} h-[54px] gap-[8px] border-b border-solid border-[#eaeaea]`}>
                        <Avatar radius={4} name={r.employee.name} />
                        <span className={`${BODY} truncate`}>{r.employee.name}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.basicSalaryFormatted}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.allowancesFormatted}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.deductionsFormatted}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.netSalaryFormatted}</span>
                      </div>
                      <div className={`${CELL} h-[54px] justify-center border-b border-solid border-[#eaeaea]`}>
                        <StatusPill label={r.status} tone={STATUS_TONE[r.status]} />
                      </div>
                      <div className={`${CELL} h-[54px] justify-center border-b border-solid border-[#eaeaea]`}>
                        <RowActionMenu
                          label={`Actions for ${r.employee.name}`}
                          actions={[
                            { label: "Edit payroll", onSelect: () => openEdit(r) },
                          ]}
                        />
                      </div>
                    </React.Fragment>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Below md the grid cannot hold seven columns; each row becomes a card. */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {rows.map((r) => (
            <div key={r.id} className="rounded-[10px] p-[12px] shadow-[inset_0_0_0_1px_#eaeaea]">
              <div className="flex items-center justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <Avatar radius={4} name={r.employee.name} />
                  <span className="truncate text-[14px] font-medium text-[#1e1e1e]">
                    {r.employee.name}
                  </span>
                </div>
                <StatusPill label={r.status} tone={STATUS_TONE[r.status]} />
              </div>
              <div className="mt-[8px] grid grid-cols-2 gap-x-[12px] gap-y-[4px] text-[13px] text-[#525252]">
                <span>Basic {r.basicSalaryFormatted}</span>
                <span className="text-right">Allow {r.allowancesFormatted}</span>
                <span>Deduct {r.deductionsFormatted}</span>
                <span className="text-right">Net {r.netSalaryFormatted}</span>
              </div>
            </div>
          ))}
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>

      {/* Add New runs payroll: the server writes one payslip per employee. */}
      <Modal
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run payroll"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setRunOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={running}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={runPayroll}
            >
              {running ? "Running..." : "Run payroll"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px]">
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            A payslip is created for every active employee in this period.
          </p>
          <div className="grid grid-cols-2 gap-[12px]">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Period start</span>
              <input
                type="date"
                value={period.start}
                onChange={(e) => setPeriod({ ...period, start: e.target.value })}
                className="h-[44px] rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Period end</span>
              <input
                type="date"
                value={period.end}
                onChange={(e) => setPeriod({ ...period, end: e.target.value })}
                className="h-[44px] rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
              />
            </label>
          </div>
        </div>
      </Modal>

      {/* Correcting a payslip — draft runs only; a posted run is in the ledger. */}
      <Modal
        open={editOf !== null}
        onClose={() => setEditOf(null)}
        title="Edit payroll"
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setEditOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !editOf?.editable}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={saveEdit}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px]">
          <div className="flex items-center gap-[12px]">
            <Avatar radius={4} name={editOf?.employee.name ?? ""} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[#1e1e1e]">
                {editOf?.employee.name}
              </p>
              <p className="text-[13px] text-[#525252]">Payslip {editOf?.index}</p>
            </div>
          </div>

          {!editOf?.editable && (
            <p role="alert" className="rounded-[8px] bg-[#fffbee] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
              This payroll run is already paid out, so its figures are locked.
            </p>
          )}

          {(
            [
              ["Basic salary", "basicSalary"],
              ["Allowances", "allowances"],
              ["Deductions", "deductions"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">{label}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!editOf?.editable}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className={MONEY_FIELD}
              />
            </label>
          ))}

          <div className="flex items-center justify-between rounded-[10px] bg-[#fafafa] px-[12px] py-[10px]">
            <span className="text-[13px] text-[#525252]">Net salary</span>
            <span className="text-[14px] font-medium text-[#1e1e1e]">
              {formatMoney((Number(form.basicSalary) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0))}
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
