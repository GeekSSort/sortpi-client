"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HrmService } from "@/services";
import { AttendanceDay } from "@/types/hrm";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { DetailSkeleton } from "@/components/shared/Skeleton";
import Avatar from "@/components/shared/Avatar";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import { useShopProfile } from "@/components/shared/useShopProfile";

/**
 * One employee's month — opened by clicking their row on the attendance list.
 *
 * The list answers "who is in today"; this answers "what has this person's
 * month looked like", which is the question asked at payroll, at a review, and
 * whenever somebody disputes a deduction. It was not answerable anywhere in the
 * app: the only attendance on screen was a single day joined onto the roster.
 *
 * A calendar rather than a table of rows, because the thing being read is a
 * SHAPE — three absences in one week is a different fact from three spread
 * over a month, and a list of dates hides that.
 */

const TONE: Record<AttendanceDay["status"], Tone> = {
  Present: "green",
  "On Leave": "amber",
  Absent: "rose",
  Holiday: "slate",
};

/** The colours the calendar cells carry, keyed the same way. */
const CELL_TONE: Record<AttendanceDay["status"], string> = {
  Present: "border-[#b7e4c7] bg-[#f0fbf4] text-[#2f6f45]",
  "On Leave": "border-[#f6dfa8] bg-[#fffaf0] text-[#8a5a12]",
  Absent: "border-[#f5c2c2] bg-[#fdf3f3] text-[#a33]",
  Holiday: "border-[#e4e4de] bg-[#fafafa] text-[#8f8d87]",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className={`flex flex-col gap-[2px] rounded-[10px] border border-solid px-[14px] py-[10px] ${tone}`}>
      <span className="text-[12px] font-medium opacity-80">{label}</span>
      <span className="text-[22px] leading-[1.2] font-bold">{value}</span>
    </div>
  );
}

export default function AttendanceDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = String(params?.id ?? "");
  const [month, setMonth] = useState(thisMonth());
  const { shop } = useShopProfile();

  const { data, loading, fetching, error, refetch } = useQuery(
    queryKey("attendance-month", { employee: employeeId, month }),
    () => HrmService.getAttendanceMonth(employeeId, month),
    { enabled: employeeId !== "" }
  );

  const employee = data?.employee ?? null;
  const days = useMemo(() => data?.days ?? [], [data]);

  /** The month laid out as weeks, with blanks before the 1st. */
  const grid = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const total = new Date(y, m, 0).getDate();
    const byDate = new Map(days.map((d) => [d.date, d]));
    const cells: ({ day: number; row: AttendanceDay | null } | null)[] = [];
    // Monday-first, which is how a working week is read here.
    const lead = (first.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      const iso = `${month}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, row: byDate.get(iso) ?? null });
    }
    return cells;
  }, [month, days]);

  const counts = useMemo(() => {
    const out = { Present: 0, "On Leave": 0, Absent: 0, Holiday: 0 } as Record<
      AttendanceDay["status"],
      number
    >;
    for (const d of days) out[d.status] = (out[d.status] ?? 0) + 1;
    return out;
  }, [days]);

  const [y, m] = month.split("-").map(Number);
  const monthName = `${MONTHS[m - 1]} ${y}`;

  return (
    <div className="flex w-full flex-col gap-[14px] pb-[24px]">
      {/* Toolbar — hidden on paper, where a month picker means nothing. */}
      <div className="flex w-full flex-col items-stretch gap-[12px] print:hidden lg:min-h-[48px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <Link
          href="/hrm/attendance"
          className="flex h-[44px] w-fit shrink-0 cursor-pointer items-center gap-[8px] rounded-[10px] bg-white px-[14px] text-[14px] font-medium text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:text-[#1e1e1e]"
        >
          ← Back to attendance
        </Link>

        <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
          <label className="flex h-[44px] items-center gap-[8px] rounded-[10px] bg-white px-[12px] text-[14px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea]">
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || thisMonth())}
              className="bg-transparent text-[14px] text-[#1e1e1e] outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
            }}
            className="flex h-[44px] cursor-pointer items-center gap-[8px] rounded-[10px] border border-solid border-[#f5b800] px-[20px] text-[14px] font-semibold text-white"
          >
            Print
          </button>
        </div>
      </div>

      {/* The sheet. `print-area` is what the print stylesheet keeps. */}
      <div className="print-area relative w-full rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea] sm:p-[20px]">
        <RefreshBar active={fetching} />
        <QueryBoundary
          loading={loading}
          error={error}
          hasData={!loading && !error}
          skeleton={<DetailSkeleton rows={8} />}
          errorMessage="That attendance sheet could not be loaded."
          onRetry={refetch}
        >
          {/* Only on paper: the sheet has to say whose shop it came from. */}
          <div className="hidden print:block">
            <p className="text-center text-[15px] font-bold">{shop.name}</p>
            <p className="mt-[2px] text-center text-[12px]">Attendance sheet</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-[12px]">
            <div className="flex min-w-0 items-center gap-[12px]">
              <Avatar radius={10} name={employee?.name ?? "—"} />
              <div className="min-w-0">
                <p className="truncate text-[18px] leading-[1.3] font-bold text-[#1e1e1e]">
                  {employee?.name ?? "—"}
                </p>
                <p className="truncate text-[13px] text-[#8f8d87]">
                  {[employee?.designation, employee?.department].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            </div>
            <p className="text-[16px] font-semibold text-[#1e1e1e]">{monthName}</p>
          </div>

          <div className="mt-[16px] grid grid-cols-2 gap-[10px] sm:grid-cols-4">
            <Tile label="Present" value={counts.Present} tone={CELL_TONE.Present} />
            <Tile label="On leave" value={counts["On Leave"]} tone={CELL_TONE["On Leave"]} />
            <Tile label="Absent" value={counts.Absent} tone={CELL_TONE.Absent} />
            <Tile
              label="Days recorded"
              value={days.length}
              tone="border-[#e4e4de] bg-white text-[#1e1e1e]"
            />
          </div>

          {/* The month as a shape. */}
          <div className="mt-[18px] grid grid-cols-7 gap-[6px]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="pb-[2px] text-center text-[11px] font-semibold text-[#8f8d87]">
                {d}
              </div>
            ))}
            {grid.map((cell, i) =>
              cell === null ? (
                <div key={`blank-${i}`} />
              ) : (
                <div
                  key={cell.day}
                  className={`flex min-h-[62px] flex-col justify-between rounded-[8px] border border-solid p-[6px] ${
                    cell.row
                      ? CELL_TONE[cell.row.status]
                      : "border-dashed border-[#eaeaea] bg-white text-[#c9c9c9]"
                  }`}
                >
                  <span className="text-[12px] font-bold">{cell.day}</span>
                  {cell.row ? (
                    <>
                      <span className="truncate text-[10px] font-medium">{cell.row.status}</span>
                      {cell.row.checkIn && (
                        <span className="truncate text-[9px] opacity-75">
                          {cell.row.checkIn.slice(0, 5)}
                          {cell.row.checkOut ? `–${cell.row.checkOut.slice(0, 5)}` : ""}
                        </span>
                      )}
                    </>
                  ) : (
                    // Nothing was recorded. NOT the same as absent: a day off,
                    // a day before they joined, and a day somebody forgot to
                    // mark all look identical in the data, and calling them
                    // absences would invent deductions.
                    <span className="text-[10px]">—</span>
                  )}
                </div>
              )
            )}
          </div>

          {/* The same month as rows, for anyone reading the times rather than
              the shape — and the only half worth having on paper. */}
          {days.length > 0 && (
            <div className="mt-[20px]">
              <p className="mb-[8px] text-[13px] font-semibold text-[#1e1e1e]">Day by day</p>
              <div className="overflow-x-auto">
                <div className="min-w-[420px]">
                  <div className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-solid border-[#eaeaea] pb-[6px] text-[12px] font-semibold text-[#8f8d87]">
                    <span>Date</span>
                    <span>Status</span>
                    <span>In</span>
                    <span>Out</span>
                  </div>
                  {days.map((d) => (
                    <div
                      key={d.id || d.date}
                      className="grid grid-cols-[1fr_1fr_1fr_1fr] items-center border-b border-solid border-[#f2f2f2] py-[8px] text-[13px] text-[#525252]"
                    >
                      <span className="font-medium text-[#1e1e1e]">
                        {Number(d.date.slice(8))} {MONTHS[m - 1]?.slice(0, 3)}
                      </span>
                      <span>
                        <StatusPill label={d.status} tone={TONE[d.status] ?? "slate"} />
                      </span>
                      <span>{d.checkIn ? d.checkIn.slice(0, 5) : "—"}</span>
                      <span>{d.checkOut ? d.checkOut.slice(0, 5) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {days.length === 0 && (
            <p className="mt-[20px] text-center text-[13px] text-[#8f8d87]">
              Nothing recorded for {monthName}.
            </p>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}
