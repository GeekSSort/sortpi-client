"use client";

import React, { useEffect, useState } from "react";
import { ApiError } from "@/services/apiClient";
import { PlatformService, PlanRow } from "@/services/platformService";
import ConsoleList, { Column, Stat } from "@/components/platform/ConsoleList";
import StatusPill from "@/components/shared/StatusPill";
import { formatMoney } from "@/lib/format";
import RowActionMenu from "@/components/shared/RowActionMenu";
import { statGood, statMoney, statTotal, statWait } from "@/components/platform/stats";

/**
 * The plans a company can be on.
 *
 * A limit of null means no ceiling, which is why it reads "Unlimited" rather
 * than a dash — a dash would look like a missing figure.
 */

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FILTERS = ["All plans", "On sale", "Private", "Retired"] as const;



function limit(value: number | null): string {
  return value === null ? "Unlimited" : String(value);
}

export default function PlatformPlansPage() {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All plans");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    PlatformService.listPlans()
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load plans.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const setPublic = async (row: PlanRow, isPublic: boolean) => {
    try {
      await PlatformService.setPlanPublic(row.code, isPublic);
      setNote(`${row.name} is now ${isPublic ? "on sale" : "private"}.`);
      setReloadKey((k) => k + 1);
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
            r.isPublic
              ? { label: "Take off sale", onSelect: () => setPublic(r, false) }
              : { label: "Put on sale", onSelect: () => setPublic(r, true) },
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

  return (
    <ConsoleList
      rows={shown}
      stats={stats}
      columns={columns}
      loading={loading}
      error={error}
      note={note}
      filters={FILTERS}
      onFilter={setFilter}
      onSearch={setSearch}
      searchPlaceholder="Search plans..."
      minWidth={1200}
      emptyLine="No plans set up."
    />
  );
}
