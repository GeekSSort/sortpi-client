"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { EmployeeRecord } from "@/types/hrm";
import { HrmService } from "@/services/hrmService";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import FilterDropdown from "@/components/shared/FilterDropdown";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import DateField from "@/components/shared/DateField";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import { toTimeInput } from "@/services/mappers/employee";
import { toApiDay } from "@/lib/dateFilter";
import { queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import {
  ActionLink,
  PageToolbar,
  PlusIcon,
  SearchInput,
  TABLE_CARD,
} from "@/components/shared/Toolbar";

/**
 * Attendance — who turned up, and when.
 *
 * This IS the screen that used to live at `/hrm`, moved rather than rebuilt.
 * It was titled "All Employees" while every column past the name was about ONE
 * DAY — Check In, Check Out, and a Present / On Leave / Absent pill — so the
 * roster question ("who works here?") could not be asked without first picking
 * a date, and the attendance question could not be asked without reading past
 * the roster.
 *
 * `/hrm` is the roster now. This kept the table, the day picker and the
 * clock-in actions, because those were always what it did.
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

// Still the source of the state's type, though the options now live on
// the dropdown itself.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FILTERS = ["All Employees", "Present", "On Leave", "Absent"] as const;

const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";

/** Local clock as "HH:MM", the value a time input wants. */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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

/** No employee photos exist server-side, so the avatar cell shows initials. */
export default function AttendancePage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key: typing a
      name is one request instead of five. */
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All Employees");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const router = useRouter();
  /** The row opens this person's month. The action menu stops the bubble so
      "Check in" does not also navigate away from the screen it acts on. */
  const openSheet = (id: string) => id && router.push(`/hrm/attendance/${id}`);
  const [day, setDay] = useState<Date | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Row actions open a dialog rather than firing straight at the API, so the
  // time can be corrected before it is saved.
  const [clockOf, setClockOf] = useState<{ row: EmployeeRecord; kind: "in" | "out" } | null>(null);
  const [clockTime, setClockTime] = useState("");
  const [dropOf, setDropOf] = useState<EmployeeRecord | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  const apiDay = day ? toApiDay(day) : undefined;
  // Every input the answer depends on is in the key. Leaving the status filter
  // or the day out would let "All Employees" and "Present" share one slot and
  // show each other's rows.
  const {
    rows,
    total,
    loading,
    loadingMore,
    fetching,
    error,
    hasMore,
    sentinelRef,
    refetch,
  } = useInfiniteRows(
    queryKey("employees", {
      search: term,
      status: filter === "All Employees" ? undefined : filter,
      day: apiDay,
    }),
    (p, limit) =>
      HrmService.getEmployees({
        search: term || undefined,
        status: filter === "All Employees" ? undefined : filter,
        day: apiDay,
        page: p,
        limit,
      }),
    { pageSize }
  );


  const act = async (fn: () => Promise<void>, done: string) => {
    setSaving(true);
    try {
      await fn();
      setNote(done);
      setClockOf(null);
      setDropOf(null);
      // A clock-in or a deactivation changes the roster here and the hours the
      // payroll run reads, so both go stale rather than only this table.
      invalidate("employees", "payroll");
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
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 59:17407. Same shape as the other list pages: search on the
          left, the controls that narrow the list on the right. */}
      <PageToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, department or designation..."
            label="Search employees"
          />
        }
      >
        <FilterDropdown
          label="Attendance"
          value={filter === "All Employees" ? "" : filter}
          onChange={(next) => setFilter((next || "All Employees") as typeof filter)}
          options={[
            { value: "All Employees", label: "All employees" },
            { value: "Present", label: "Present" },
            { value: "On Leave", label: "On leave" },
            { value: "Absent", label: "Absent" },
          ]}
        />

        <DateField
          value={day}
          onChange={(d) => {
            setDay(d);
            // Page 1 of the new day, not page 5 of the old one.
          }}
          ariaLabel="Filter attendance by date"
        />

        <ActionLink href="/hrm/payroll" variant="secondary">
          <PayrollIcon />
          Payroll
        </ActionLink>

        <ActionLink href="/hrm/add" variant="primary">
          <PlusIcon />
          Add New
        </ActionLink>
      </PageToolbar>

      {/* Table card — 59:17439 */}
      <div className={TABLE_CARD}>
        <RefreshBar active={fetching} />
        {note && (
          <p role="status" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        {/* Table — 59:17443 */}
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className="min-w-[1050px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip bg-white`}>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>#</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Employee</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Department</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Designation</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Check In</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Check Out</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Action</span></div>

                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={!loading && !error}
                  skeleton={
                    <div className="col-span-8">
                      <TableSkeleton columns={GRID} rows={8} />
                    </div>
                  }
                  errorMessage={HrmService.describeError(error)}
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <div className="col-span-8">
                    <EmptyState
                      message={
                        term || filter !== "All Employees" || day
                          ? "No employees match this view."
                          : "No employees yet."
                      }
                      hint={
                        term || filter !== "All Employees" || day
                          ? undefined
                          : "Add one to get started."
                      }
                      compact
                    />
                  </div>
                )}

                {rows.map((e, i) => (
                    <React.Fragment key={e.id || e.index}>
                      <div onClick={() => openSheet(e.id)} className={`${CELL} h-[54px] cursor-pointer ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={BODY}>{e.index}</span>
                      </div>
                      <div onClick={() => openSheet(e.id)} className={`${CELL} h-[54px] cursor-pointer gap-[8px] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <Avatar radius={4} name={e.name} />
                        <span className={`${BODY} truncate`}>{e.name}</span>
                      </div>
                      <div onClick={() => openSheet(e.id)} className={`${CELL} h-[54px] cursor-pointer ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={`${BODY} truncate`}>{e.department}</span>
                      </div>
                      <div onClick={() => openSheet(e.id)} className={`${CELL} h-[54px] cursor-pointer ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={`${BODY} truncate`}>{e.designation}</span>
                      </div>
                      <div onClick={() => openSheet(e.id)} className={`${CELL} h-[54px] cursor-pointer ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={BODY}>{e.checkIn}</span>
                      </div>
                      <div onClick={() => openSheet(e.id)} className={`${CELL} h-[54px] cursor-pointer ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <span className={BODY}>{e.checkOut}</span>
                      </div>
                      <div onClick={() => openSheet(e.id)} className={`${CELL} h-[54px] cursor-pointer justify-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}>
                        <StatusPill label={e.status} tone={STATUS_TONE[e.status] ?? "slate"} />
                      </div>
                      <div
                        onClick={(ev) => ev.stopPropagation()}
                        className={`${CELL} h-[54px] justify-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                      >
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
                </QueryBoundary>
              </div>
            </div>
          </div>
        </div>

        {/* Below md the grid cannot hold eight columns; each row becomes a card. */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {/* Below md there is no table, so the boundary around it never
              speaks here. Without this the phone showed one blank card for
              loading, for failure and for an empty list alike. */}
          <CardListState
            loading={loading}
            error={error}
            hasData={!loading && !error}
            isEmpty={rows.length === 0}
            errorMessage={HrmService.describeError(error)}
            emptyMessage={term || filter !== "All Employees" || day ? "No employees match this view." : "No employees yet."}
            onRetry={refetch}
            rows={4}
          />
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

        <ScrollEnd
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          shown={rows.length}
          total={total}
          noun="employees"
        />
        </div>
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