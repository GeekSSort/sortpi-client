"use client";

import React, { useMemo, useState } from "react";
import { ActivityStatus, RecentActivityItem } from "@/types/dashboard";
import TablePagination from "@/components/shared/TablePagination";
import RowActionMenu from "@/components/shared/RowActionMenu";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import Link from "next/link";

/**
 * Recent Activities — Figma 30:16894.
 *
 * A centred title over a table: 40px head, 54px rows, pager below. Three
 * columns share the space; the last three are fixed at 150, 170 and 130.
 *
 * Below md each row becomes a card, because six columns have nowhere to go on
 * a phone. No Figma frame for that; it is our choice.
 */

const STATUS: Record<ActivityStatus, { bg: string; fg: string }> = {
  Delivered: { bg: "#dcfce7", fg: "#22c55e" },
  Pending: { bg: "#fef3c7", fg: "#6d5b46" },
  Process: { bg: "#f1f5f9", fg: "#0f172a" },
  Shipping: { bg: "#fff2e8", fg: "#fe954d" },
  // Not drawn in the design; same construction, danger hue.
  Cancelled: { bg: "#fee2e2", fg: "#ef4444" },
};

function StatusPill({ status }: { status: ActivityStatus }) {
  const tone = STATUS[status] ?? STATUS.Process;
  return (
    <span
      className="inline-flex h-[24px] shrink-0 items-center gap-[7px] overflow-clip rounded-[17px] px-[9px]"
      style={{ backgroundColor: tone.bg }}
    >
      <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: tone.fg }} />
      <span
        className="text-[12px] leading-normal font-medium tracking-[-0.24px] whitespace-nowrap"
        style={{ color: tone.fg }}
      >
        {status}
      </span>
    </span>
  );
}

/** vuesax/linear/more — node 30:17007, turned upright as in the design. */


const CELL = "flex items-center p-[12px]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";


interface RecentActivitiesTableProps {
  activities: RecentActivityItem[];
}

export default function RecentActivitiesTable({ activities }: RecentActivitiesTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [detailOf, setDetailOf] = useState<RecentActivityItem | null>(null);

  const totalPages = Math.max(1, Math.ceil(activities.length / pageSize));
  const current = Math.min(page, totalPages);
  const rows = useMemo(
    () => activities.slice((current - 1) * pageSize, current * pageSize),
    [activities, current, pageSize]
  );

  return (
    <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
      {/* Head — 30:16895 */}
      <div className="flex h-[48px] items-center justify-center px-[16px]">
        <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.32px] text-[#1e1e1e]">
          Recent Activities
        </p>
      </div>

      {/* Table — 30:16898, inset 16px */}
      <div className="mt-[9px] hidden px-[16px] md:block">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Column head — its own 6px outline */}
            <div className="flex items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]">
              <div className={`${CELL} h-[40px] min-w-px flex-1 bg-white`}>
                <span className={HEAD}>Activity</span>
              </div>
              <div className={`${CELL} h-[40px] min-w-px flex-1 bg-white`}>
                <span className={`${HEAD} whitespace-nowrap`}>Reference</span>
              </div>
              <div className={`${CELL} h-[40px] min-w-px flex-1 bg-white`}>
                <span className={`${HEAD} whitespace-nowrap`}>Date &amp; Time</span>
              </div>
              <div className={`${CELL} h-[40px] w-[150px] shrink-0 bg-white`}>
                <span className={`${HEAD} whitespace-nowrap`}>Amount</span>
              </div>
              <div className={`${CELL} h-[40px] w-[170px] shrink-0 bg-white`}>
                <span className={`${HEAD} whitespace-nowrap`}>Status</span>
              </div>
              <div className={`${CELL} h-[40px] w-[130px] shrink-0 justify-center bg-white`}>
                <span className={`${HEAD} whitespace-nowrap`}>Action</span>
              </div>
            </div>

            {/* Rows — 54px, 6px under the head */}
            <div className="mt-[6px]">
              {rows.map((a, i) => (
                <div
                  key={a.id}
                  className={`flex h-[54px] items-center ${
                    i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"
                  }`}
                >
                  <div className={`${CELL} min-w-px flex-1`}>
                    <span className={`${TEXT} truncate`}>{a.activity}</span>
                  </div>
                  <div className={`${CELL} min-w-px flex-1`}>
                    <span className={`${TEXT} truncate`}>{a.reference}</span>
                  </div>
                  <div className={`${CELL} min-w-px flex-1`}>
                    <span className={`${TEXT} truncate`}>{a.dateTime}</span>
                  </div>
                  <div className={`${CELL} w-[150px] shrink-0`}>
                    <span className={`${TEXT} truncate`}>{a.amountFormatted}</span>
                  </div>
                  <div className={`${CELL} w-[170px] shrink-0`}>
                    <StatusPill status={a.status} />
                  </div>
                  <div className={`${CELL} w-[130px] shrink-0 justify-center`}>
                    <RowActionMenu
                      label={`Actions for ${a.reference}`}
                      actions={[{ label: "View details", onSelect: () => setDetailOf(a) }]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stacked cards below md */}
      <div className="mt-[9px] flex flex-col gap-[10px] px-[16px] md:hidden">
        {rows.map((a) => (
          <div key={a.id} className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]">
            <div className="flex items-start justify-between gap-[10px]">
              <div className="min-w-0">
                <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{a.activity}</p>
                <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                  {a.reference}
                </p>
              </div>
              <StatusPill status={a.status} />
            </div>
            <div className="mt-[10px] flex items-center justify-between gap-[10px]">
              <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                {a.dateTime}
              </span>
              <span className={`${TEXT} shrink-0`}>{a.amountFormatted}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination — 30:17020 */}
      <div className="mt-[9px]">
        <TablePagination
          page={current}
          pageSize={pageSize}
          total={activities.length}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>
      {/* What the row already knows, laid out to be read. */}
      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={detailOf?.reference ?? "Activity"}
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setDetailOf(null)}>
              Close
            </button>
            <Link
              href="/sales-pos/sales"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => setDetailOf(null)}
            >
              Open in Sales
            </Link>
          </>
        }
      >
        <dl className="flex flex-col gap-[10px] text-[14px]">
          {(
            [
              ["Activity", detailOf?.activity],
              ["Reference", detailOf?.reference],
              ["Date & time", detailOf?.dateTime],
              ["Amount", detailOf?.amountFormatted],
              ["Status", detailOf?.status],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-[12px]">
              <dt className="text-[#525252]">{label}</dt>
              <dd className="truncate font-medium text-[#1e1e1e]">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}