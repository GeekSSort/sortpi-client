"use client";

import React, { useState } from "react";
import { ApiError } from "@/services/apiClient";
import { PlatformService, SubscriptionRow, toDate, toLabel } from "@/services/platformService";
import { invalidate, queryKey, useQuery } from "@/lib/query/useQuery";
import ConsoleList, { Column, Stat } from "@/components/platform/ConsoleList";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import { formatMoney } from "@/lib/format";
import RowActionMenu from "@/components/shared/RowActionMenu";
import { statGood, statMoney, statTotal, statWait } from "@/components/platform/stats";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";

/**
 * What each company is on.
 *
 * A subscription carries only the company id, so the company names are looked
 * up from the companies list and joined here.
 */

const TONE: Record<string, Tone> = {
  ACTIVE: "green",
  TRIALING: "orange",
  PAST_DUE: "gold",
  SUSPENDED: "rose",
  CANCELLED: "slate",
};

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";
const FILTERS = ["All subscriptions", "Active", "On trial", "Past due", "Cancelled"] as const;
const STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const;
/** The same tracks as `columns` below, as a literal so Tailwind emits the class. */
const GRID = "grid-cols-[1.4fr_1fr_1fr_1fr_1fr_150px_83px]";


export default function PlatformSubscriptionsPage() {
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All subscriptions");
  const [saving, setSaving] = useState(false);
  const [planOf, setPlanOf] = useState<SubscriptionRow | null>(null);
  const [nextPlan, setNextPlan] = useState("");
  const [statusOf, setStatusOf] = useState<SubscriptionRow | null>(null);
  const [nextStatus, setNextStatus] = useState<string>("ACTIVE");
  const [billOf, setBillOf] = useState<SubscriptionRow | null>(null);
  const [dueDays, setDueDays] = useState("14");
  const [cancelOf, setCancelOf] = useState<SubscriptionRow | null>(null);

  const subs = useQuery("platform-subscriptions", async () => {
    const res = await PlatformService.listSubscriptions();
    return res.data;
  });
  // Company names sit under the companies base so a change over there reaches
  // this column, and the plan list under the plans base so a plan taken off
  // sale drops out of the "change plan" picker without a reload.
  const names = useQuery(queryKey("platform-companies", { view: "names" }), () =>
    PlatformService.tenantNames()
  );
  const planList = useQuery("platform-plans", async () => {
    const res = await PlatformService.listPlans();
    return res.data;
  });

  const rows = subs.data ?? [];
  const plans = (planList.data ?? []).map((p) => ({ code: p.code, name: p.name }));
  const loading = subs.loading || names.loading;
  const fetching = subs.fetching || names.fetching || planList.fetching;
  const hasData = subs.data !== undefined && names.data !== undefined;
  const error = subs.error ?? names.error ?? planList.error;
  const refetch = () => {
    void subs.refetch();
    void names.refetch();
    void planList.refetch();
  };

  const act = async (fn: () => Promise<void>, done: string, touched: string[]) => {
    setSaving(true);
    try {
      await fn();
      setNote(done);
      setPlanOf(null);
      setStatusOf(null);
      setBillOf(null);
      setCancelOf(null);
      invalidate(...touched);
    } catch (e) {
      setNote(PlatformService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (r: SubscriptionRow) =>
    names.data?.get(r.organizationId) || r.organizationId.slice(0, 8);
  const needle = search.trim().toLowerCase();
  const byFilter = rows.filter((r) => {
    if (filter === "Active") return r.status === "ACTIVE";
    if (filter === "On trial") return r.status === "TRIALING";
    if (filter === "Past due") return r.status === "PAST_DUE" || r.status === "SUSPENDED";
    if (filter === "Cancelled") return r.status === "CANCELLED";
    return true;
  });
  const shown = needle
    ? byFilter.filter(
        (r) => nameOf(r).toLowerCase().includes(needle) || r.planName.toLowerCase().includes(needle)
      )
    : byFilter;

  const columns: Column<SubscriptionRow>[] = [
    {
      key: "company",
      label: "Company",
      width: "1.4fr",
      mobile: true,
      cell: (r) => <span className="truncate text-[14px] font-medium text-[#1e1e1e]">{nameOf(r)}</span>,
    },
    { key: "plan", label: "Plan", width: "1fr", mobile: true, cell: (r) => <span className={BODY}>{r.planName}</span> },
    {
      key: "price",
      label: "Price",
      width: "1fr",
      mobile: true,
      cell: (r) => <span className={BODY}>{formatMoney(r.planPrice)}</span>,
    },
    {
      key: "period",
      label: "Period ends",
      width: "1fr",
      mobile: true,
      cell: (r) => <span className={BODY}>{toDate(r.periodEnd)}</span>,
    },
    {
      key: "trial",
      label: "Trial ends",
      width: "1fr",
      cell: (r) => <span className={BODY}>{r.trialEndsAt ? toDate(r.trialEndsAt) : "—"}</span>,
    },
    {
      key: "status",
      label: "Status",
      width: "150px",
      align: "center",
      cell: (r) => <StatusPill label={toLabel(r.status)} tone={TONE[r.status] ?? "slate"} />,
    },
    {
      key: "action",
      label: "Action",
      width: "83px",
      align: "center",
      cell: (r) => (
        <RowActionMenu
          label={`Actions for ${nameOf(r)}`}
          actions={[
            {
              label: "Change plan",
              onSelect: () => {
                setNextPlan("");
                setPlanOf(r);
              },
            },
            {
              label: "Set status",
              onSelect: () => {
                setNextStatus(r.status);
                setStatusOf(r);
              },
            },
            { label: "Issue invoice", onSelect: () => setBillOf(r) },
            ...(r.status === "CANCELLED" ? [] : [{ label: "Cancel", onSelect: () => setCancelOf(r) }]),
          ]}
        />
      ),
    },
  ];

  const monthly = rows
    .filter((r) => r.status === "ACTIVE")
    .reduce((sum, r) => sum + r.planPrice, 0);
  const stats: Stat[] = [
    statTotal({ label: "Subscriptions", value: rows.length }),
    statGood({
      label: "Active",
      value: rows.filter((r) => r.status === "ACTIVE").length,
      note: "paying now",
    }),
    statWait({
      label: "On trial",
      value: rows.filter((r) => r.status === "TRIALING").length,
      note: "not paying yet",
    }),
    statMoney({ label: "Monthly", value: formatMoney(monthly), note: "from active plans" }),
  ];

  return (
    <>
      <ConsoleList
        rows={shown}
        stats={stats}
        columns={columns}
        loading={loading}
        fetching={fetching}
        hasData={hasData}
        skeletonGrid={GRID}
        error={
          error
            ? error instanceof ApiError
              ? error.message
              : "Could not load subscriptions."
            : null
        }
        onRetry={refetch}
        note={note}
        filters={FILTERS}
        onFilter={setFilter}
        minWidth={1150}
        onSearch={setSearch}
        searchPlaceholder="Search by company or plan..."
        emptyLine="No subscriptions yet."
      />

      <Modal
        open={planOf !== null}
        onClose={() => setPlanOf(null)}
        title="Change plan"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setPlanOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !nextPlan}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                planOf &&
                act(
                  () => PlatformService.changePlan(planOf.id, nextPlan),
                  `${nameOf(planOf)} moved to a new plan.`,
                  // The company's Plan column and every per-plan figure move
                  // with it, so all four collections are stale.
                  [
                    "platform-subscriptions",
                    "platform-plans",
                    "platform-companies",
                    "platform-overview",
                  ]
                )
              }
            >
              {saving ? "Saving..." : "Change plan"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] text-[#525252]">
            {planOf ? nameOf(planOf) : ""} is on {planOf?.planName}. The next bill uses the new
            plan.
          </p>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">New plan</span>
            <select value={nextPlan} onChange={(e) => setNextPlan(e.target.value)} className={FIELD}>
              <option value="">Pick a plan</option>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>

      <Modal
        open={statusOf !== null}
        onClose={() => setStatusOf(null)}
        title="Set status"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setStatusOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                statusOf &&
                act(
                  () => PlatformService.setSubscriptionStatus(statusOf.id, nextStatus),
                  `${nameOf(statusOf)} is now ${toLabel(nextStatus)}.`,
                  // Companies shows the same status in its own Status column.
                  ["platform-subscriptions", "platform-companies", "platform-overview"]
                )
              }
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] leading-[1.6] text-[#525252]">
            Suspending stops the shop from signing in at their next token. Past due keeps them
            trading &mdash; an unpaid bill is a conversation, not a lockout.
          </p>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Status</span>
            <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className={FIELD}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {toLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>

      <Modal
        open={billOf !== null}
        onClose={() => setBillOf(null)}
        title="Issue an invoice"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setBillOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                billOf &&
                act(
                  () => PlatformService.issueInvoice(billOf.id, Number(dueDays) || 14),
                  `Invoice raised for ${nameOf(billOf)}.`,
                  // The new bill must be on the Invoices screen straight away.
                  ["platform-invoices", "platform-subscriptions", "platform-overview"]
                )
              }
            >
              {saving ? "Raising..." : "Issue invoice"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] text-[#525252]">
            Bills {billOf ? nameOf(billOf) : ""} now, instead of waiting for the nightly run.
          </p>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Days to pay</span>
            <input
              type="number"
              min="0"
              max="365"
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
              className={FIELD}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={cancelOf !== null}
        onClose={() => setCancelOf(null)}
        title="Cancel subscription"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setCancelOf(null)}>
              Keep it
            </button>
            <button
              type="button"
              disabled={saving}
              style={{ backgroundImage: RED_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                cancelOf &&
                act(
                  () => PlatformService.cancelSubscription(cancelOf.id, true),
                  `${nameOf(cancelOf)} will end at the period end.`,
                  // A cancellation drops the company out of the paying counts.
                  ["platform-subscriptions", "platform-companies", "platform-overview"]
                )
              }
            >
              {saving ? "Cancelling..." : "Cancel at period end"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          <span className="font-medium text-[#1e1e1e]">{cancelOf ? nameOf(cancelOf) : ""}</span> keeps
          working until {cancelOf ? toDate(cancelOf.periodEnd) : "the period ends"}, then stops
          being billed.
        </p>
      </Modal>
    </>
  );
}
