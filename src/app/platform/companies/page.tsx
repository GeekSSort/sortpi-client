"use client";

import React, { useEffect, useState } from "react";
import { ApiError } from "@/services/apiClient";
import { PlatformService, TenantRow, toDate, toLabel } from "@/services/platformService";
import ConsoleList, { Column, Stat } from "@/components/platform/ConsoleList";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import Modal, { MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import RowActionMenu from "@/components/shared/RowActionMenu";
import { statGood, statRisk, statTotal, statWait } from "@/components/platform/stats";

/**
 * Every company on the platform.
 *
 * Where our own staff land after signing in at the console address. It shows
 * the figures a support call asks about: plan, status, how many people and how
 * many branches.
 */

const TONE: Record<string, Tone> = {
  ACTIVE: "green",
  TRIALING: "orange",
  PAST_DUE: "gold",
  SUSPENDED: "rose",
  CANCELLED: "slate",
};

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FILTERS = ["All companies", "Paying", "On trial", "Need chasing", "Closed"] as const;

/* The icons a console figure uses. Same set as the dashboard, so a card means
   the same thing wherever it appears. */


export default function PlatformCompaniesPage() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [detailOf, setDetailOf] = useState<TenantRow | null>(null);
  const [closeOf, setCloseOf] = useState<TenantRow | null>(null);
  const [filter, setFilter] = useState<string>("All companies");
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await PlatformService.listTenants(search || undefined);
        if (cancelled) return;
        // SYSTEM is our own organization, not a customer. It owns no shop data
        // and exists to hold pre-login audit rows.
        setRows(res.data.filter((r) => r.name !== "SYSTEM"));
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError && e.code === "REALM_MISMATCH"
            ? "This is a shop account. The console needs a SORTPoint staff sign-in."
            : e instanceof ApiError
              ? e.message
              : "Could not load companies."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search, reloadKey]);

  const columns: Column<TenantRow>[] = [
    {
      key: "name",
      label: "Company",
      width: "1.4fr",
      mobile: true,
      cell: (r) => (
        <button
          type="button"
          onClick={() => setDetailOf(r)}
          className="flex min-w-0 cursor-pointer flex-col text-left transition-colors hover:text-[#f5b800]"
        >
          <span className="truncate text-[14px] font-medium text-[#1e1e1e]">{r.name}</span>
          <span className="truncate text-[12px] text-[#8f8d87]">
            {r.subdomain ? `${r.subdomain}.sortpoint` : "no address yet"}
          </span>
        </button>
      ),
    },
    { key: "plan", label: "Plan", width: "1fr", mobile: true, cell: (r) => <span className={BODY}>{toLabel(r.plan)}</span> },
    { key: "users", label: "People", width: "110px", mobile: true, cell: (r) => <span className={BODY}>{r.userCount}</span> },
    { key: "branches", label: "Branches", width: "110px", mobile: true, cell: (r) => <span className={BODY}>{r.branchCount}</span> },
    { key: "since", label: "Joined", width: "1fr", mobile: true, cell: (r) => <span className={BODY}>{toDate(r.createdAt)}</span> },
    {
      key: "status",
      label: "Status",
      width: "150px",
      align: "center",
      cell: (r) => (
        <StatusPill
          label={r.isActive ? toLabel(r.status) : "Closed"}
          tone={r.isActive ? (TONE[String(r.status)] ?? "slate") : "slate"}
        />
      ),
    },
    {
      key: "action",
      label: "Action",
      width: "83px",
      align: "center",
      cell: (r) => (
        <RowActionMenu
          label={`Actions for ${r.name}`}
          actions={[
            { label: "View details", onSelect: () => setDetailOf(r) },
            r.isActive
              ? { label: "Close company", onSelect: () => setCloseOf(r) }
              : { label: "Reopen company", onSelect: () => setActive(r, true) },
          ]}
        />
      ),
    },
  ];

  const shownRows = rows.filter((r) => {
    if (filter === "Paying") return r.status === "ACTIVE";
    if (filter === "On trial") return r.status === "TRIALING";
    if (filter === "Need chasing") return r.status === "PAST_DUE" || r.status === "SUSPENDED";
    if (filter === "Closed") return !r.isActive;
    return true;
  });

  const setActive = async (row: TenantRow, isActive: boolean) => {
    setSaving(true);
    try {
      await PlatformService.setCompanyActive(row.id, isActive);
      setNote(`${row.name} is now ${isActive ? "open" : "closed"}.`);
      setCloseOf(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setNote(PlatformService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const stats: Stat[] = [
    statTotal({ label: "Companies", value: rows.length, note: `${rows.filter((r) => r.isActive).length} open` }),
    statGood({ label: "Paying", value: count("ACTIVE"), note: "on an active plan" }),
    statWait({ label: "On trial", value: count("TRIALING"), note: "not paying yet" }),
    statRisk({
      label: "Need chasing",
      value: count("PAST_DUE") + count("SUSPENDED"),
      note: "overdue or stopped",
    }),
  ];

  return (
    <>
      <ConsoleList
        rows={shownRows}
        note={note}
        filters={FILTERS}
        onFilter={setFilter}
        minWidth={1100}
        stats={stats}
        columns={columns}
        loading={loading}
        error={error}
        onSearch={setSearch}
        searchPlaceholder="Search by company name..."
        emptyLine="No companies match this search."
      />

      {/* What the list already knows, laid out to be read on a support call. */}
      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={detailOf?.name ?? "Company"}
        width={440}
        footer={
          <button type="button" className={MODAL_GHOST} onClick={() => setDetailOf(null)}>
            Close
          </button>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <div className="flex items-center justify-between gap-[12px]">
            <span className="text-[13px] text-[#525252]">Status</span>
            <StatusPill
              label={detailOf?.isActive ? toLabel(detailOf?.status ?? null) : "Closed"}
              tone={detailOf?.isActive ? (TONE[String(detailOf?.status)] ?? "slate") : "slate"}
            />
          </div>
          <dl className="flex flex-col gap-[10px] text-[14px]">
            {(
              [
                ["Web address", detailOf?.subdomain ? `${detailOf.subdomain}.sortpoint` : "Not set"],
                ["Plan", toLabel(detailOf?.plan ?? null)],
                ["People", String(detailOf?.userCount ?? 0)],
                ["Branches", String(detailOf?.branchCount ?? 0)],
                ["Joined", toDate(detailOf?.createdAt)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-[12px]">
                <dt className="text-[#525252]">{label}</dt>
                <dd className="truncate font-medium text-[#1e1e1e]">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            Suspending a company, changing its plan and reading its invoices are not
            possible yet: the console API has no write for them.
          </p>
        </div>
      </Modal>

      {/* Closing a company stops every sign-in for it, so it asks first. */}
      <Modal
        open={closeOf !== null}
        onClose={() => setCloseOf(null)}
        title="Close this company"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setCloseOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              style={{ backgroundImage: RED_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() => closeOf && setActive(closeOf, false)}
            >
              {saving ? "Closing..." : "Close company"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          Nobody at <span className="font-medium text-[#1e1e1e]">{closeOf?.name}</span> will be
          able to sign in. Their data is kept, and you can reopen them from this list.
        </p>
      </Modal>
    </>
  );
}
