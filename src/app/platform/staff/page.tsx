"use client";

import React, { useEffect, useState } from "react";
import { ApiError } from "@/services/apiClient";
import { PlatformService, StaffRow, toDate } from "@/services/platformService";
import ConsoleList, { Column } from "@/components/platform/ConsoleList";
import StatusPill from "@/components/shared/StatusPill";
import Avatar from "@/components/shared/Avatar";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import RowActionMenu from "@/components/shared/RowActionMenu";
import { statGood, statRisk, statTotal, statWait } from "@/components/platform/stats";

/**
 * The SORTPoint people who can sign in to this console.
 *
 * These accounts belong to no company, which is what keeps them out of every
 * shop's data.
 */

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M10 4.375v11.25M4.375 10h11.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function PlatformStaffPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    PlatformService.listStaff()
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load staff.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => r.fullName.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle))
    : rows;

  const setActive = async (row: StaffRow, isActive: boolean) => {
    try {
      await PlatformService.setStaffActive(row.id, isActive);
      setNote(`${row.email} is now ${isActive ? "active" : "inactive"}.`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(PlatformService.describeError(e));
    }
  };

  const add = async () => {
    setSaving(true);
    try {
      await PlatformService.createStaff(form);
      setNote(`${form.email} can now sign in to the console.`);
      setAddOpen(false);
      setForm({ fullName: "", email: "", password: "" });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add that person.");
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<StaffRow>[] = [
    {
      key: "name",
      label: "Name",
      width: "1.4fr",
      mobile: true,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-[8px]">
          <Avatar name={r.fullName || r.email} radius={4} />
          <span className="truncate text-[14px] font-medium text-[#1e1e1e]">{r.fullName || "—"}</span>
        </span>
      ),
    },
    { key: "email", label: "Email", width: "1.6fr", mobile: true, cell: (r) => <span className={`${BODY} truncate`}>{r.email}</span> },
    { key: "phone", label: "Phone", width: "1fr", mobile: true, cell: (r) => <span className={BODY}>{r.phone}</span> },
    { key: "since", label: "Added", width: "1fr", mobile: true, cell: (r) => <span className={BODY}>{toDate(r.createdAt)}</span> },
    {
      key: "status",
      label: "Status",
      width: "150px",
      align: "center",
      cell: (r) => <StatusPill label={r.isActive ? "Active" : "Inactive"} tone={r.isActive ? "green" : "rose"} />,
    },
    {
      key: "action",
      label: "Action",
      width: "83px",
      align: "center",
      cell: (r) => (
        <RowActionMenu
          label={`Actions for ${r.fullName || r.email}`}
          actions={[
            r.isActive
              ? { label: "Deactivate", onSelect: () => setActive(r, false) }
              : { label: "Reactivate", onSelect: () => setActive(r, true) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <ConsoleList
        rows={shown}
        stats={[
          statTotal({ label: "Staff", value: rows.length }),
          statGood({
            label: "Active",
            value: rows.filter((r) => r.isActive).length,
            note: "can sign in",
          }),
          statWait({
            label: "Added this month",
            value: rows.filter((r) => new Date(r.createdAt).getMonth() === new Date().getMonth()).length,
            note: "new accounts",
          }),
          statRisk({
            label: "Inactive",
            value: rows.filter((r) => !r.isActive).length,
            note: "cannot sign in",
          }),
        ]}
        columns={columns}
        loading={loading}
        error={error}
        note={note}
        onSearch={setSearch}
        searchPlaceholder="Search by name or email..."
        minWidth={900}
        emptyLine="No console staff yet."
        actions={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            Add staff
          </button>
        }
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add console staff"
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !form.email || !form.password}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={add}
            >
              {saving ? "Adding..." : "Add"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] leading-[1.6] text-[#525252]">
            This person will be able to see every company on the platform. There is no
            invitation email for console accounts yet, so set a password and pass it on.
          </p>
          {(
            [
              ["Full name", "fullName", "text"],
              ["Email", "email", "email"],
              ["Password", "password", "password"],
            ] as const
          ).map(([label, key, type]) => (
            <label key={key} className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">{label}</span>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className={FIELD}
              />
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}
