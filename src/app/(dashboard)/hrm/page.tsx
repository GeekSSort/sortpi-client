"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EmployeeRecord } from "@/types/hrm";
import { HrmService } from "@/services/hrmService";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import DateField from "@/components/shared/DateField";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import { toTimeInput } from "@/services/mappers/employee";
import { toApiDay } from "@/lib/dateFilter";

/**
 * All Employees — Figma 59:17405.
 *
 * Columns are fixed at both ends and share the middle: # 80, Employee 230,
 * then four equal columns, then Status 140 and Action 83. Rows are 54 tall
 * with 12px cells, matching the frame.
 */

const GRID = "grid-cols-[80px_230px_1fr_1fr_1fr_1fr_140px_83px]";
const CELL = "flex items-center px-[12px]";
const HEAD =
  "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e] whitespace-nowrap";
const BODY =
  "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252] whitespace-nowrap";

const STATUS_TONE: Record<EmployeeRecord["status"], Tone> = {
  Present: "mint",
  "On Leave": "gold",
  Absent: "rose",
};

const FILTERS = ["All Employees", "Present", "On Leave", "Absent"] as const;

const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";

/** Local clock as "HH:MM", the value a time input wants. */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

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
      <path
        d="M2.25 4.5h13.5M4.5 9h9m-6.75 4.5h4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path d="m7 10 5 5 5-5" fill="currentColor" />
    </svg>
  );
}

function PayrollIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <rect x="2.5" y="5" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 8.5v3M14.5 8.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** No employee photos exist server-side, so the avatar cell shows initials. */
export default function HrmPage() {
  const [rows, setRows] = useState<EmployeeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All Employees");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [day, setDay] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Row actions open a dialog rather than firing straight at the API, so the
  // time can be corrected before it is saved.
  const [clockOf, setClockOf] = useState<{ row: EmployeeRecord; kind: "in" | "out" } | null>(null);
  const [clockTime, setClockTime] = useState("");
  const [dropOf, setDropOf] = useState<EmployeeRecord | null>(null);
  const [saving, setSaving] = useState(false);
  /** The debounce is for typing. Waiting 250ms to make the FIRST request
      just adds a quarter second of blank table on reload. */
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await HrmService.getEmployees({
        search: query || undefined,
        status: filter === "All Employees" ? undefined : filter,
        day: day ? toApiDay(day) : undefined,
        page,
        limit: pageSize,
      });
      setRows(res.data);
      setTotal(res.total);
      setNote(null);
    } catch (e) {
      setNote(HrmService.describeError(e));
    } finally {
      setLoading(false);
    }
  }, [query, filter, day, page, pageSize]);

  useEffect(() => {
    // Debounced: this used to fire a request per keystroke. The guard was
    // already here, so the rows were never wrong — just five requests to type
    // a name.
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      (async () => {
        try {
          const res = await HrmService.getEmployees({
            search: query || undefined,
            status: filter === "All Employees" ? undefined : filter,
            day: day ? toApiDay(day) : undefined,
            page,
            limit: pageSize,
          });
          if (cancelled) return;
          setRows(res.data);
          setTotal(res.total);
          setNote(null);
        } catch (e) {
          if (!cancelled) setNote(HrmService.describeError(e));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, firstLoad.current ? 0 : 250);
    firstLoad.current = false;
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, filter, day, page, pageSize]);

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

  const act = async (fn: () => Promise<void>, done: string) => {
    setSaving(true);
    try {
      await fn();
      setNote(done);
      setClockOf(null);
      setDropOf(null);
      await load();
    } catch (e) {
      setNote(HrmService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  /** Open the clock dialog with whatever time is already on the row. */
  const openClock = (row: EmployeeRecord, kind: "in" | "out") => {
    setClockTime(toTimeInput(kind === "in" ? row.checkIn : row.checkOut) || nowTime());
    setClockOf({ row, kind });
  };

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Headline — 59:17407. Same shape as the other list pages: search on the
          left, the controls that narrow the list on the right. */}
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
              placeholder="Search by name, department or designation..."
              aria-label="Search employees"
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
                      {f}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DateField
            value={day}
            onChange={(d) => {
              setDay(d);
              // Page 1 of the new day, not page 5 of the old one.
              setPage(1);
            }}
            ariaLabel="Filter attendance by date"
          />

          <Link
            href="/hrm/payroll"
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[12px] text-[16px] leading-[24px] font-medium whitespace-nowrap text-[#525252] transition-colors hover:bg-[#fafafa]"
          >
            <PayrollIcon />
            Payroll
          </Link>

          <Link
            href="/hrm/add"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
            }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            Add New
          </Link>
        </div>
      </div>

      {/* Table card — 59:17439 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        {note && (
          <p role="status" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        {/* Table — 59:17443 */}
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1050px]">
              <div className={`grid ${GRID} items-start overflow-clip`}>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>#</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Employee</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Department</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Designation</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Check In</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Check Out</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Action</span></div>

                {loading && (
                  <div className="col-span-8 px-[12px] py-[28px] text-center text-[14px] text-[#525252]">
                    Loading employees…
                  </div>
                )}

                {loading && rows.length === 0 && (
                  <TableSkeleton columns={GRID} rows={pageSize} />
                )}
                {!loading && rows.length === 0 && (
                  <div className="col-span-8 px-[12px] py-[28px] text-center text-[14px] text-[#525252]">
                    No employees match this view.
                  </div>
                )}

                {!loading &&
                  rows.map((e, i) => (
                    <React.Fragment key={e.id || e.index}>
                      <div className={`${CELL} h-[54px] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={BODY}>{e.index}</span>
                      </div>
                      <div className={`${CELL} h-[54px] gap-[8px] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <Avatar radius={4} name={e.name} />
                        <span className={`${BODY} truncate`}>{e.name}</span>
                      </div>
                      <div className={`${CELL} h-[54px] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={`${BODY} truncate`}>{e.department}</span>
                      </div>
                      <div className={`${CELL} h-[54px] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={`${BODY} truncate`}>{e.designation}</span>
                      </div>
                      <div className={`${CELL} h-[54px] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={BODY}>{e.checkIn}</span>
                      </div>
                      <div className={`${CELL} h-[54px] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={BODY}>{e.checkOut}</span>
                      </div>
                      <div className={`${CELL} h-[54px] justify-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <StatusPill label={e.status} tone={STATUS_TONE[e.status] ?? "slate"} />
                      </div>
                      <div className={`${CELL} h-[54px] justify-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <RowActionMenu
                          label={`Actions for ${e.name}`}
                          actions={[
                            { label: "Check in", onSelect: () => openClock(e, "in") },
                            { label: "Check out", onSelect: () => openClock(e, "out") },
                            { label: "Deactivate", onSelect: () => setDropOf(e) },
                          ]}
                        />
                      </div>
                    </React.Fragment>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Below md the grid cannot hold eight columns; each row becomes a card. */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {rows.map((e) => (
            <div key={e.id || e.index} className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]">
              <div className="flex items-center justify-between gap-[8px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <Avatar radius={4} name={e.name} />
                  <span className={`${BODY} truncate`}>{e.name}</span>
                </div>
                <StatusPill label={e.status} tone={STATUS_TONE[e.status] ?? "slate"} />
              </div>
              <div className="mt-[8px] grid grid-cols-2 gap-x-[12px] gap-y-[4px] text-[13px] text-[#525252]">
                <span>{e.department}</span>
                <span className="text-right">{e.designation}</span>
                <span>In {e.checkIn}</span>
                <span className="text-right">Out {e.checkOut}</span>
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

      {/* Check in / check out — the time is editable before it is saved. */}
      <Modal
        open={clockOf !== null}
        onClose={() => setClockOf(null)}
        title={clockOf?.kind === "out" ? "Check out" : "Check in"}
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setClockOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !clockTime}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                clockOf &&
                act(
                  () => HrmService.clock(clockOf.row.id, clockOf.kind, clockTime),
                  `${clockOf.row.name} checked ${clockOf.kind} at ${clockTime}.`
                )
              }
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px]">
          <div className="flex items-center gap-[12px]">
            <Avatar radius={4} name={clockOf?.row.name ?? ""} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[#1e1e1e]">{clockOf?.row.name}</p>
              <p className="truncate text-[13px] text-[#525252]">
                {clockOf?.row.designation} · {clockOf?.row.department}
              </p>
            </div>
          </div>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">
              {clockOf?.kind === "out" ? "Check out time" : "Check in time"}
            </span>
            <input
              type="time"
              value={clockTime}
              onChange={(e) => setClockTime(e.target.value)}
              className={FIELD}
            />
          </label>

          <div className="flex justify-between rounded-[10px] bg-[#fafafa] px-[12px] py-[10px] text-[13px] text-[#525252]">
            <span>In {clockOf?.row.checkIn}</span>
            <span>Out {clockOf?.row.checkOut}</span>
          </div>
        </div>
      </Modal>

      {/* Deactivate asks first — it takes the person off the active roster. */}
      <Modal
        open={dropOf !== null}
        onClose={() => setDropOf(null)}
        title="Deactivate employee"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setDropOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              style={{ backgroundImage: RED_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                dropOf &&
                act(() => HrmService.deactivate(dropOf.id), `${dropOf.name} deactivated.`)
              }
            >
              {saving ? "Working..." : "Deactivate"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          <span className="font-medium text-[#1e1e1e]">{dropOf?.name}</span> will be removed from
          the active employee list. Their records and attendance history are kept.
        </p>
      </Modal>
    </div>
  );
}