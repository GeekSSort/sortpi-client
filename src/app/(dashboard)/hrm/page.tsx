"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmployeeProfile } from "@/types/hrm";
import { HrmService } from "@/services/hrmService";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import FilterDropdown from "@/components/shared/FilterDropdown";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import Modal, { MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import { queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import EmployeeEditDialog from "@/components/modules/dashboard/EmployeeEditDialog";

/**
 * Employees — the roster. Figma 385:2193.
 *
 * Who works here, which is a question about PEOPLE and not about a date. The
 * screen that used to be at this address answered a different one: every
 * column past the name was one day's attendance — Check In, Check Out, and a
 * Present / On Leave / Absent pill — so the staff list could not be read
 * without first choosing a day, and somebody off sick sat in the same column
 * as somebody who had left the company. That screen is `/hrm/attendance` now.
 *
 * The design's eight columns are the design's widths: 60 / 180 / 200 / 182 /
 * 140 / 140 / 142 / 85, which sum to the 1128 inside the card's padding. As
 * `fr` rather than `px` so the row divides a wider viewport in the design's
 * proportions instead of leaving a gap on the right — the same thing every
 * other table here does.
 *
 * The SEARCH sits above the card rather than inside its header, with the
 * actions on the right, because that is where every other list on this app
 * puts them and a table that carried its own toolbar would be the odd one out.
 */

const GRID = "grid-cols-[60fr_180fr_200fr_182fr_140fr_140fr_142fr_85fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252]";

const COLUMNS = [
  "#",
  "Employee",
  "Email",
  "Phone Number",
  "Department",
  "Designation",
  "Join Date",
] as const;

/** `2026-04-11` -> `11-04-2026`, the order the design writes. */
function joinDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

function SearchIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function EmployeesPage() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const [note, setNote] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<EmployeeProfile | null>(null);
  const [editing, setEditing] = useState<EmployeeProfile | null>(null);
  const [removing, setRemoving] = useState<EmployeeProfile | null>(null);
  const [busy, setBusy] = useState(false);
  /** "" is everyone; the roster has always had no way to ask for one or the
      other, so somebody marked as left stayed in the list. */
  const [active, setActive] = useState("");

  const query = useInfiniteRows(
    queryKey("hrm-roster", { term, active }),
    (p, limit) =>
      HrmService.getRoster({
        search: term,
        active: active === "" ? undefined : active === "active",
        page: p,
        limit,
      }),
    { pageSize }
  );

  const { rows, total, loadingMore, hasMore, sentinelRef } = query;

  const confirmLeave = async () => {
    if (!leaving) return;
    setBusy(true);
    try {
      await HrmService.deactivate(leaving.id);
      setNote(`${leaving.name} is no longer active.`);
      setLeaving(null);
      invalidate("hrm-roster", "hrm");
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await HrmService.deleteEmployee(removing.id);
      setNote(`${removing.name} was removed.`);
      setRemoving(null);
      invalidate("hrm-roster", "hrm");
    } catch (e) {
      // The API refuses anybody who has ever been paid and says why —
      // `EMPLOYEE_HAS_PAYROLL`. That message names the thing to do instead, so
      // it is shown rather than replaced with a generic failure.
      setNote(e instanceof Error && e.message ? e.message : "That could not be deleted.");
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (e: EmployeeProfile) => [
    { label: "Edit", onSelect: () => setEditing(e) },
    { label: "See attendance", onSelect: () => router.push("/hrm/attendance") },
    ...(e.isActive
      ? [{ label: "Mark as left", tone: "danger" as const, onSelect: () => setLeaving(e) }]
      : []),
    { label: "Delete", tone: "danger" as const, onSelect: () => setRemoving(e) },
  ];

  return (
    <div className="flex w-full flex-col gap-[16px] pb-[24px]">
      {/* Toolbar — outside the card, search left, actions right. */}
      <div className="flex w-full flex-col items-stretch gap-[12px] lg:h-[48px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-[16px]">
        <div className="flex h-[44px] w-full items-center gap-[8px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:min-w-[220px] lg:max-w-[370px] lg:flex-1">
          <span className="text-[#525252]">
            <SearchIcon />
          </span>
          <input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
            }}
            placeholder="Search by name, ID, email, phone..."
            aria-label="Search employees"
            className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
          />        </div>

        {/* The filters, beside the search box: a narrowed list has to
            say on screen that it is narrowed. */}
        <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
          <FilterDropdown
            label="Status"
            value={active}
            onChange={setActive}
            options={[
              { value: "", label: "Everyone" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Left" },
            ]}
          />
        </div>

        <div className="flex shrink-0 items-center gap-[12px]">
          <Link
            href="/hrm/attendance"
            className="flex h-[44px] shrink-0 items-center justify-center rounded-[10px] bg-white px-[16px] text-[14px] font-medium whitespace-nowrap text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]"
          >
            Attendance
          </Link>
          <Link
            href="/hrm/add"
            className="flex h-[44px] shrink-0 items-center justify-center rounded-[10px] bg-[#f5b800] px-[16px] text-[14px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#e5a612]"
          >
            Add Employee
          </Link>
        </div>
      </div>

      {/* The card — Figma 385:2193. */}
      <div className="relative w-full overflow-hidden rounded-[10px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <RefreshBar active={query.fetching} />

        <div className="flex items-center px-[16px] pt-[16px] pb-[8px]">
          <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] whitespace-nowrap text-[#1e1e1e]">
            Employee List
          </p>
        </div>

        {/* Table from md up. Eight columns need room, so it scrolls sideways
            inside the card rather than squeezing the email to nothing. */}
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] md:block">
          <div className="min-w-[1000px]">
            <div className={`table-head grid ${GRID} border-b border-solid border-[#eaeaea] bg-white`}>
              {COLUMNS.map((label) => (
                <div key={label} className={`${CELL} h-[40px]`}>
                  <span className={`${HEAD} whitespace-nowrap`}>{label}</span>
                </div>
              ))}
              <div className={`${CELL} h-[40px] justify-center`}>
                <span className={`${HEAD} whitespace-nowrap`}>Action</span>
              </div>
            </div>

            <QueryBoundary
              loading={query.loading}
              error={query.error}
              hasData={!query.loading && !query.error}
              errorMessage="The employee list could not be loaded."
              onRetry={query.refetch}
              skeleton={<TableSkeleton columns={GRID} rows={8} />}
            >
              {rows.length === 0 && (
                <p className="px-[12px] py-[24px] text-[14px] text-[#8f8d87]">
                  {term ? "No employees match that search." : "Nobody on the roster yet."}
                </p>
              )}
              {rows.map((e) => (
                <div
                  key={e.id}
                  className={`grid ${GRID} border-b border-solid border-[#f2f2f2] transition-colors hover:bg-[#fafafa]`}
                >
                  <div className={CELL}>
                    <span className={`${TEXT} truncate`}>{e.index}</span>
                  </div>
                  <div className={CELL}>
                    <span className="flex min-w-0 items-center gap-[10px]">
                      <Avatar name={e.name} size={28} />
                      <span
                        className={`${TEXT} truncate !text-[#1e1e1e]`}
                        title={e.name}
                      >
                        {e.name}
                      </span>
                    </span>
                  </div>
                  <div className={CELL}>
                    <span className={`${TEXT} truncate`} title={e.email}>
                      {e.email || "—"}
                    </span>
                  </div>
                  <div className={CELL}>
                    <span className={`${TEXT} truncate`}>{e.phone || "—"}</span>
                  </div>
                  <div className={CELL}>
                    <span className={`${TEXT} truncate`}>{e.department || "—"}</span>
                  </div>
                  <div className={CELL}>
                    <span className={`${TEXT} truncate`}>{e.designation || "—"}</span>
                  </div>
                  <div className={CELL}>
                    <span className={`${TEXT} truncate`}>{joinDate(e.joinedOn)}</span>
                  </div>
                  <div className={`${CELL} justify-center`}>
                    <RowActionMenu label={`Actions for ${e.name}`} actions={actionsFor(e)} />
                  </div>
                </div>
              ))}
            </QueryBoundary>
          </div>
        </div>

        {/* Cards below md — eight columns do not fit a phone. */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[8px] md:hidden">
          <CardListState
            loading={query.loading}
            error={query.error}
            hasData={!query.loading && !query.error}
            isEmpty={rows.length === 0}
            errorMessage="The employee list could not be loaded."
            emptyMessage={term ? "No employees match that search." : "Nobody on the roster yet."}
            onRetry={query.refetch}
            rows={4}
          />
          {rows.map((e) => (
            <div
              key={e.id}
              className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]"
            >
              <div className="flex items-start justify-between gap-[10px]">
                <span className="flex min-w-0 items-center gap-[10px]">
                  <Avatar name={e.name} size={32} />
                  <span className="flex min-w-0 flex-col">
                    <span className={`${TEXT} truncate !text-[#1e1e1e] !font-medium`}>
                      {e.name}
                    </span>
                    <span className="truncate text-[12px] tracking-[-0.24px] text-[#8f8d87]">
                      {e.designation || "—"}
                    </span>
                  </span>
                </span>
                <RowActionMenu label={`Actions for ${e.name}`} actions={actionsFor(e)} />
              </div>
              <div className="mt-[10px] flex flex-col gap-[3px] text-[12px] tracking-[-0.24px] text-[#525252]">
                <span className="truncate">{e.email || "—"}</span>
                <span className="flex items-center justify-between gap-[10px]">
                  <span className="truncate">{e.phone || "—"}</span>
                  <span className="shrink-0">{e.department || "—"}</span>
                </span>
                <span className="text-[#8f8d87]">Joined {joinDate(e.joinedOn)}</span>
              </div>
            </div>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        <div className="mt-[9px]">
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
      </div>

      <EmployeeEditDialog
        open={editing !== null}
        employee={editing}
        onClose={() => setEditing(null)}
        onSaved={(name) => {
          setNote(`${name} updated.`);
          invalidate("hrm-roster", "hrm");
        }}
      />

      {/* Delete — a real removal, refused by the API for anybody with
          payslips. The confirm says which case this is before it is tried. */}
      <Modal
        open={removing !== null}
        onClose={() => !busy && setRemoving(null)}
        title="Delete this employee?"
        width={430}
        footer={
          <>
            <button
              type="button"
              className={MODAL_GHOST}
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              style={{ backgroundImage: RED_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={confirmDelete}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          {removing?.name} and their attendance records are removed for good. Anybody
          who has ever been paid cannot be deleted — a payslip has to keep naming
          somebody — and the server will say so and leave the record alone.
        </p>
      </Modal>

      <Modal
        open={leaving !== null}
        onClose={() => !busy && setLeaving(null)}
        title="Mark as left?"
        width={420}
        footer={
          <>
            <button
              type="button"
              className={MODAL_GHOST}
              disabled={busy}
              onClick={() => setLeaving(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              style={{ backgroundImage: RED_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={confirmLeave}
            >
              {busy ? "Saving…" : "Mark as left"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          {leaving?.name} stops appearing on the active roster and in payroll runs. Their
          records — attendance, payslips — are kept.
        </p>
      </Modal>
    </div>
  );
}
