"use client";

import React, { useState } from "react";
import { ApiError } from "@/services/apiClient";
import { PlatformService, PlanInput, PlanRow } from "@/services/platformService";
import { invalidate, useQuery } from "@/lib/query/useQuery";
import ConsoleList, { Column, Stat } from "@/components/platform/ConsoleList";
import StatusPill from "@/components/shared/StatusPill";
import { formatMoney } from "@/lib/format";
import RowActionMenu from "@/components/shared/RowActionMenu";
import { statGood, statMoney, statTotal, statWait } from "@/components/platform/stats";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";

/**
 * The plans a company can be on.
 *
 * A limit of null means no ceiling, which is why it reads "Unlimited" rather
 * than a dash — a dash would look like a missing figure.
 *
 * The screen used to be READ-ONLY but for the on-sale toggle, while
 * `POST /platform/plans/` and `PATCH /platform/plans/{code}/` had been on the
 * server since billing was written, with `plan.create` and `plan.update` as
 * real permission codes and `PlanService` behind them. So the price, the
 * trial, and the branch, seat and product ceilings — the terms the whole
 * business is sold on — could only be changed by editing
 * `apps/billing/defaults.py` and re-running a management command against
 * production. The page looked finished and half its backend was unreachable.
 */

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FILTERS = ["All plans", "On sale", "Private", "Retired"] as const;
/** The same tracks as `columns` below, as a literal so Tailwind emits the class. */
const GRID = "grid-cols-[1.4fr_1fr_110px_120px_120px_130px_130px_83px]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800] disabled:bg-[#fafafa] disabled:text-[#8f8d87]";

/** An empty plan, for the "New plan" form. */
const BLANK: PlanInput = {
  code: "",
  name: "",
  description: "",
  price: 0,
  interval: "MONTHLY",
  trialDays: 0,
  maxBranches: null,
  maxUsers: null,
  maxProducts: null,
  isPublic: true,
  isActive: true,
};

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M10 4.375v11.25M4.375 10h11.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A ceiling box: a number, or blank for "no limit".
 *
 * Blank rather than a magic number, because null and 0 are genuinely different
 * answers here — 0 branches is a plan nobody can use, and `Subscription.limit()`
 * reads null as "no ceiling".
 */
function LimitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-[#1e1e1e]">{label}</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value === null ? "" : String(value)}
        placeholder="Unlimited"
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? null : Math.max(0, Number(raw) || 0));
        }}
        className={FIELD}
      />
    </label>
  );
}


function limit(value: number | null): string {
  return value === null ? "Unlimited" : String(value);
}

export default function PlatformPlansPage() {
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All plans");
  /**
   * The plan being written, and whether it already exists.
   *
   * One form for both, because a create and an edit differ in exactly one
   * field: `code` is typed on create and frozen afterwards. `PlanService.update`
   * refuses a changed code with PLAN_CODE_IMMUTABLE — an invoice stamps it, so
   * repointing a code at different terms would restate history — and the field
   * is disabled rather than hidden so the reason is visible.
   */
  const [editing, setEditing] = useState<{ form: PlanInput; existingCode?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Search and filter are applied in the browser over the whole list, so
  // neither belongs in the key: they do not change what is requested.
  const { data, loading, fetching, error, refetch } = useQuery("platform-plans", async () => {
    const res = await PlatformService.listPlans();
    return res.data;
  });
  const rows = data ?? [];

  const setPublic = async (row: PlanRow, isPublic: boolean) => {
    try {
      await PlatformService.setPlanPublic(row.code, isPublic);
      setNote(`${row.name} is now ${isPublic ? "on sale" : "private"}.`);
      // A plan taken off sale must disappear from the Subscriptions "change
      // plan" list as well, or someone moves a company onto a retired plan.
      invalidate("platform-plans", "platform-subscriptions", "platform-overview");
    } catch (e) {
      setNote(PlatformService.describeError(e));
    }
  };

  const openEditor = (row?: PlanRow) => {
    setFormError(null);
    setEditing(
      row
        ? {
            existingCode: row.code,
            form: {
              code: row.code,
              name: row.name,
              description: row.description,
              price: row.price,
              interval: row.interval,
              trialDays: row.trialDays,
              maxBranches: row.maxBranches,
              maxUsers: row.maxUsers,
              maxProducts: row.maxProducts,
              isPublic: row.isPublic,
              isActive: row.isActive,
            },
          }
        : { form: { ...BLANK } }
    );
  };

  const savePlan = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      await PlatformService.savePlan(editing.form, editing.existingCode);
      setNote(
        editing.existingCode ? `${editing.form.name} updated.` : `${editing.form.name} created.`
      );
      setEditing(null);
      // A plan's terms are quoted on the subscriptions screen and counted into
      // the console overview, so both go stale the moment one changes.
      invalidate("platform-plans", "platform-subscriptions", "platform-overview");
    } catch (e) {
      setFormError(PlatformService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (row: PlanRow, isActive: boolean) => {
    try {
      await PlatformService.setPlanActive(row.code, isActive);
      setNote(`${row.name} is now ${isActive ? "available" : "retired"}.`);
      invalidate("platform-plans", "platform-subscriptions", "platform-overview");
    } catch (e) {
      setNote(PlatformService.describeError(e));
    }
  };

  const needle = search.trim().toLowerCase();
  const byFilter = rows.filter((r) => {
    if (filter === "On sale") return r.isActive && r.isPublic;
    if (filter === "Private") return r.isActive && !r.isPublic;
    if (filter === "Retired") return !r.isActive;
    return true;
  });
  const shown = needle
    ? byFilter.filter(
        (r) => r.name.toLowerCase().includes(needle) || r.code.toLowerCase().includes(needle)
      )
    : byFilter;

  const columns: Column<PlanRow>[] = [
    {
      key: "name",
      label: "Plan",
      width: "1.4fr",
      mobile: true,
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-medium text-[#1e1e1e]">{r.name}</span>
          <span className="truncate text-[12px] text-[#8f8d87]">{r.description}</span>
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      width: "1fr",
      mobile: true,
      cell: (r) => (
        <span className={BODY}>
          {formatMoney(r.price)}
          <span className="text-[#8f8d87]"> / {r.interval.toLowerCase()}</span>
        </span>
      ),
    },
    { key: "trial", label: "Trial", width: "110px", mobile: true, cell: (r) => <span className={BODY}>{r.trialDays ? `${r.trialDays} days` : "None"}</span> },
    { key: "branches", label: "Branches", width: "120px", mobile: true, cell: (r) => <span className={BODY}>{limit(r.maxBranches)}</span> },
    { key: "users", label: "People", width: "120px", mobile: true, cell: (r) => <span className={BODY}>{limit(r.maxUsers)}</span> },
    { key: "products", label: "Products", width: "130px", cell: (r) => <span className={BODY}>{limit(r.maxProducts)}</span> },
    {
      key: "status",
      label: "Sold",
      width: "130px",
      align: "center",
      cell: (r) => (
        <StatusPill
          label={r.isActive ? (r.isPublic ? "Public" : "Private") : "Retired"}
          tone={r.isActive ? (r.isPublic ? "green" : "gold") : "slate"}
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
            { label: "Edit plan", onSelect: () => openEditor(r) },
            r.isPublic
              ? { label: "Take off sale", onSelect: () => setPublic(r, false) }
              : { label: "Put on sale", onSelect: () => setPublic(r, true) },
            // No delete: `Plan.subscriptions` is RESTRICT and every invoice
            // stamps a plan code, so removing a row either fails on a live
            // subscription or erases the terms an issued invoice was written
            // under. Retiring keeps the history and stops new sign-ups.
            r.isActive
              ? { label: "Retire plan", onSelect: () => setActive(r, false) }
              : { label: "Bring back", onSelect: () => setActive(r, true) },
          ]}
        />
      ),
    },
  ];

  const prices = rows.filter((r) => r.price > 0).map((r) => r.price);
  const stats: Stat[] = [
    statTotal({ label: "Plans", value: rows.length }),
    statGood({
      label: "On sale",
      value: rows.filter((r) => r.isActive && r.isPublic).length,
      note: "a company can pick these",
    }),
    statWait({
      label: "Not sold",
      value: rows.filter((r) => !r.isPublic || !r.isActive).length,
      note: "private or retired",
    }),
    statMoney({
      label: "Dearest",
      value: prices.length ? formatMoney(Math.max(...prices)) : "—",
      note: prices.length ? `from ${formatMoney(Math.min(...prices))}` : "no paid plan",
    }),
  ];

  const form = editing?.form;
  const canSave = Boolean(
    form && form.name.trim() && (editing?.existingCode || /^[-a-z0-9_]{2,}$/.test(form.code))
  );

  return (
    <>
    <ConsoleList
      rows={shown}
      stats={stats}
      columns={columns}
      loading={loading}
      fetching={fetching}
      hasData={data !== undefined}
      skeletonGrid={GRID}
      error={error ? (error instanceof ApiError ? error.message : "Could not load plans.") : null}
      onRetry={refetch}
      note={note}
      filters={FILTERS}
      onFilter={setFilter}
      onSearch={setSearch}
      searchPlaceholder="Search plans..."
      minWidth={1200}
      emptyLine="No plans set up."
      actions={
        <button
          type="button"
          onClick={() => openEditor()}
          style={{ backgroundImage: GOLD_GRADIENT }}
          className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
        >
          <AddIcon />
          New plan
        </button>
      }
    />

    <Modal
      open={editing !== null}
      onClose={() => setEditing(null)}
      title={editing?.existingCode ? `Edit ${editing.form.name || editing.existingCode}` : "New plan"}
      width={560}
      footer={
        <>
          <button type="button" className={MODAL_GHOST} onClick={() => setEditing(null)}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !canSave}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className={MODAL_PRIMARY}
            onClick={savePlan}
          >
            {saving ? "Saving..." : editing?.existingCode ? "Save changes" : "Create plan"}
          </button>
        </>
      }
    >
      {form && (
        <div className="flex flex-col gap-[14px]">
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Name</span>
              <input
                value={form.name}
                onChange={(e) => setEditing({ ...editing!, form: { ...form, name: e.target.value } })}
                className={FIELD}
                placeholder="Starter"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Code</span>
              <input
                value={form.code}
                disabled={Boolean(editing?.existingCode)}
                onChange={(e) =>
                  setEditing({
                    ...editing!,
                    form: { ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") },
                  })
                }
                className={FIELD}
                placeholder="starter"
              />
              <span className="text-[12px] leading-[1.4] text-[#8f8d87]">
                {editing?.existingCode
                  ? "Fixed once the plan exists — invoices stamp it."
                  : "Lowercase, digits and hyphens. It cannot be changed later."}
              </span>
            </label>
          </div>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Description</span>
            <input
              value={form.description}
              onChange={(e) =>
                setEditing({ ...editing!, form: { ...form, description: e.target.value } })
              }
              className={FIELD}
              placeholder="One branch, three people."
            />
          </label>

          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-3">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Price</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={String(form.price)}
                onChange={(e) =>
                  setEditing({
                    ...editing!,
                    form: { ...form, price: Math.max(0, Number(e.target.value) || 0) },
                  })
                }
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Billed</span>
              <select
                value={form.interval}
                onChange={(e) =>
                  setEditing({ ...editing!, form: { ...form, interval: e.target.value } })
                }
                className={FIELD}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Trial days</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={String(form.trialDays)}
                onChange={(e) =>
                  setEditing({
                    ...editing!,
                    form: { ...form, trialDays: Math.max(0, Number(e.target.value) || 0) },
                  })
                }
                className={FIELD}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-3">
            <LimitField
              label="Branches"
              value={form.maxBranches}
              onChange={(v) => setEditing({ ...editing!, form: { ...form, maxBranches: v } })}
            />
            <LimitField
              label="People"
              value={form.maxUsers}
              onChange={(v) => setEditing({ ...editing!, form: { ...form, maxUsers: v } })}
            />
            <LimitField
              label="Products"
              value={form.maxProducts}
              onChange={(v) => setEditing({ ...editing!, form: { ...form, maxProducts: v } })}
            />
          </div>
          <p className="text-[12px] leading-[1.5] text-[#8f8d87]">
            Leave a ceiling blank for no limit. Lowering one does not remove
            anything a company already has — it stops them adding more.
          </p>

          <div className="flex flex-col gap-[8px]">
            <label className="flex cursor-pointer items-center gap-[10px] text-[13px] text-[#1e1e1e]">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) =>
                  setEditing({ ...editing!, form: { ...form, isPublic: e.target.checked } })
                }
                className="size-[18px] accent-[#f5b800]"
              />
              On sale — a company can pick this plan
            </label>
            <label className="flex cursor-pointer items-center gap-[10px] text-[13px] text-[#1e1e1e]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setEditing({ ...editing!, form: { ...form, isActive: e.target.checked } })
                }
                className="size-[18px] accent-[#f5b800]"
              />
              Available — turning this off retires the plan without touching
              anybody already on it
            </label>
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
            >
              {formError}
            </p>
          )}
        </div>
      )}
    </Modal>
    </>
  );
}
