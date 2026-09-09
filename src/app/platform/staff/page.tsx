"use client";

import React, { useState } from "react";
import { ApiError } from "@/services/apiClient";
import { PlatformRoleRow, PlatformService, StaffRow, toDate } from "@/services/platformService";
import { invalidate, useMutation, useQuery } from "@/lib/query/useQuery";
import ConsoleList, { Column } from "@/components/platform/ConsoleList";
import StatusPill from "@/components/shared/StatusPill";
import Avatar from "@/components/shared/Avatar";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import RowActionMenu from "@/components/shared/RowActionMenu";
import { statGood, statRisk, statTotal, statWait } from "@/components/platform/stats";

/**
 * The SortPi people who can sign in to this console.
 *
 * These accounts belong to no company, which is what keeps them out of every
 * shop's data.
 */

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";
/** The same tracks as `columns` below, as a literal so Tailwind emits the class. */
const GRID = "grid-cols-[1.4fr_1.6fr_1fr_1fr_1.2fr_150px_83px]";

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M10 4.375v11.25M4.375 10h11.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function PlatformStaffPage() {
  const [search, setSearch] = useState("");
  /** A write that failed, kept apart from a read that failed: the rows are fine. */
  const [writeError, setWriteError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "" });
  /**
   * The server's complaint about ONE field, shown under that field.
   *
   * Django's password validators reject a common password, a numeric one and
   * one too similar to the email — correctly, on an account that can see every
   * tenant on the platform. The dialog put that sentence in the page-level
   * error banner above the table, unattributed, so "Add" appeared to do
   * nothing and the reason was somewhere else on screen beside three fields.
   */
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  /**
   * Handing the console to somebody else.
   *
   * It ADDS an owner and removes none: stepping down is a separate edit, and
   * the server refuses that while the caller is the only active owner. So a
   * handover interrupted half-way leaves TWO owners rather than a console
   * nobody can administer — `staff.create` and `role.update` belong to
   * Platform Owner alone, and an account holding neither cannot repair it.
   */
  const [handOverOpen, setHandOverOpen] = useState(false);
  const [handOver, setHandOver] = useState({ email: "", fullName: "" });
  const [handingOver, setHandingOver] = useState(false);
  const [handOverError, setHandOverError] = useState<string | null>(null);

  /**
   * The roles this console can grant.
   *
   * Fetched, never hard-coded: the four seeded names live in
   * `apps/platform/registry.py`, and a copy here drifts the first time one is
   * renamed.
   */
  const { data: roleRows } = useQuery("platform-roles", () =>
    PlatformService.listPlatformRoles()
  );
  const roles: PlatformRoleRow[] = roleRows ?? [];

  // Searched in the browser over the one list, so the key carries no params.
  const { data, loading, fetching, error, refetch } = useQuery("platform-staff", async () => {
    const res = await PlatformService.listStaff();
    return res.data;
  });
  const rows = data ?? [];

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => r.fullName.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle))
    : rows;

  // Console accounts belong to no company, so nothing outside this list moves.
  const { mutate: createStaff, pending: saving } = useMutation(
    (payload: { fullName: string; email: string; password: string; roles: string[] }) =>
      PlatformService.createStaff(payload),
    { invalidates: ["platform-staff"] }
  );

  const setActive = async (row: StaffRow, isActive: boolean) => {
    try {
      await PlatformService.setStaffActive(row.id, isActive);
      setNote(`${row.email} is now ${isActive ? "active" : "inactive"}.`);
      setWriteError(null);
      invalidate("platform-staff");
    } catch (e) {
      setWriteError(PlatformService.describeError(e));
    }
  };

  const add = async () => {
    setPasswordError(null);
    try {
      await createStaff({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        // A role is required by the form, so this is never empty in practice;
        // the array shape is what the API takes, and one role is what a
        // console account needs.
        roles: form.role ? [form.role] : [],
      });
      setNote(`${form.email} can now sign in to the console as ${form.role}.`);
      setWriteError(null);
      setAddOpen(false);
      setForm({ fullName: "", email: "", password: "", role: "" });
    } catch (e) {
      // A field the server named goes UNDER that field; anything else is a
      // banner. Both, not one or the other: an error attached to a field the
      // dialog does not show would otherwise disappear entirely.
      const forPassword = PlatformService.fieldError(e, "password");
      setPasswordError(forPassword);
      if (!forPassword) {
        setWriteError(e instanceof ApiError ? e.message : "Could not add that person.");
      }
    }
  };

  const transfer = async () => {
    setHandingOver(true);
    setHandOverError(null);
    try {
      await PlatformService.transferOwnership(handOver.email.trim(), handOver.fullName.trim());
      setNote(
        `${handOver.email.trim()} is now a Platform Owner. ` +
          "They have been emailed a link to set a password. You can step down once they have."
      );
      setHandOverOpen(false);
      setHandOver({ email: "", fullName: "" });
      invalidate("platform-staff");
    } catch (e) {
      setHandOverError(PlatformService.describeError(e));
    } finally {
      setHandingOver(false);
    }
  };

  const changeRole = async (row: StaffRow, roleName: string) => {
    try {
      await PlatformService.setStaffRoles(row.id, [roleName]);
      setNote(`${row.email} is now ${roleName}.`);
      setWriteError(null);
      invalidate("platform-staff");
    } catch (e) {
      // The one refusal that has a next step: offer it instead of printing a
      // sentence the person cannot act on.
      if (e instanceof ApiError && e.code === "LAST_PLATFORM_OWNER") {
        setWriteError(`${e.message} Use "Hand over ownership" above.`);
      } else {
        setWriteError(PlatformService.describeError(e));
      }
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
      key: "roles",
      label: "Role",
      width: "1.2fr",
      mobile: true,
      cell: (r) =>
        r.roles.length ? (
          <span className={`${BODY} truncate`}>{r.roles.join(", ")}</span>
        ) : (
          // Not a dash. An account with no role can sign in and reach nothing,
          // which is a state somebody has to be told about rather than shown
          // an empty cell for.
          <StatusPill label="No access" tone="rose" />
        ),
    },
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
            ...roles.map((role) => ({
              label:
                r.roles.includes(role.name)
                  ? `${role.name} (current)`
                  : `Make ${role.name}`,
              onSelect: () => changeRole(r, role.name),
            })),
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
        fetching={fetching}
        hasData={data !== undefined}
        skeletonGrid={GRID}
        error={
          writeError ??
          (error ? (error instanceof ApiError ? error.message : "Could not load staff.") : null)
        }
        onRetry={refetch}
        note={note}
        onSearch={setSearch}
        searchPlaceholder="Search by name or email..."
        minWidth={900}
        emptyLine="No console staff yet."
        actions={
          <>
          <button
            type="button"
            onClick={() => setHandOverOpen(true)}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] text-[15px] font-medium whitespace-nowrap text-[#525252] transition-colors hover:bg-[#fafafa]"
          >
            Hand over ownership
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            Add staff
          </button>
          </>
        }
      />

      <Modal
        open={handOverOpen}
        onClose={() => setHandOverOpen(false)}
        title="Hand over ownership"
        width={460}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setHandOverOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={handingOver || !handOver.email.trim()}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={transfer}
            >
              {handingOver ? "Sending..." : "Make them an owner"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] leading-[1.6] text-[#525252]">
            They become a Platform Owner straight away, and are emailed a link
            to choose their own password if the account is new. Nothing is taken
            away from you — step down afterwards by changing your own role.
          </p>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Their email</span>
            <input
              type="email"
              value={handOver.email}
              onChange={(e) => setHandOver({ ...handOver, email: e.target.value })}
              className={FIELD}
              placeholder="successor@sortpi.com"
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Their name (optional)</span>
            <input
              value={handOver.fullName}
              onChange={(e) => setHandOver({ ...handOver, fullName: e.target.value })}
              className={FIELD}
            />
          </label>
          <p className="text-[12px] leading-[1.5] text-[#8f8d87]">
            There is always at least one Platform Owner. Until somebody else
            holds it, the console will refuse to let the last one step down —
            an account that can neither mint staff nor edit a role cannot be
            repaired from inside the console.
          </p>
          {handOverError && (
            <p
              role="alert"
              className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
            >
              {handOverError}
            </p>
          )}
        </div>
      </Modal>

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
              disabled={saving || !form.email || !form.password || !form.role}
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

          {/*
            Password, on its own, because it is the field the server talks
            back about. The rules are stated BEFORE the attempt and the
            server's own sentence is shown UNDER the box after it — the whole
            complaint used to land in the page banner above the table, where
            it read as "something went wrong" beside three fields.
          */}
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Password</span>
            {/* Show/hide, like every other password box in the app: this one
                is TYPED for somebody else and then read out to them, so seeing
                it is the whole point. */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value });
                  // Their next attempt is a new one; the old complaint is
                  // stale the moment they start typing.
                  if (passwordError) setPasswordError(null);
                }}
                aria-invalid={passwordError ? true : undefined}
                className={`${FIELD} pr-[44px] ${passwordError ? "shadow-[inset_0_0_0_1.5px_#e63946]" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-[12px] -translate-y-1/2 cursor-pointer text-[12px] font-medium text-[#525252]"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {passwordError ? (
              <span role="alert" className="text-[12px] leading-[1.5] font-medium text-[#a02620]">
                {passwordError}
              </span>
            ) : (
              <span className="text-[12px] leading-[1.5] text-[#8f8d87]">
                At least 8 characters. Not a common password, not all digits,
                and not close to the email address — this account can read every
                company on the platform.
              </span>
            )}
          </label>

          {/*
            THE ROLE. This form had no role field at all, and the API took
            none, so every account it created held no platform role — signed in
            successfully and was refused by every console screen, with no route
            to repair it short of the Django admin.
          */}
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Role</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={FIELD}
            >
              <option value="">Choose a role…</option>
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
            <span className="text-[12px] leading-[1.5] text-[#8f8d87]">
              {roles.find((r) => r.name === form.role)?.description ||
                "Without one this account can sign in and reach nothing."}
            </span>
          </label>
        </div>
      </Modal>
    </>
  );
}
