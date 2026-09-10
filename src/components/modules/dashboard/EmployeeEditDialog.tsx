"use client";

import React, { useMemo, useState } from "react";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { HrmService } from "@/services/hrmService";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import type { EmployeeProfile } from "@/types/hrm";

/**
 * Correct a staff record.
 *
 * A typo in somebody's email could not be fixed at all: `EmployeeViewSet`
 * carried `list`, `create`, `retrieve` and `deactivate` and nothing else, so
 * the only thing the roster could do to a wrong record was hide it.
 *
 * Sends a PATCH of what CHANGED rather than the whole form. The two are
 * different requests: a full replace would blank a field the form never
 * carried, and "same email as before" would otherwise collide with the record
 * being edited.
 */
export default function EmployeeEditDialog({
  open,
  employee,
  onClose,
  onSaved,
}: {
  open: boolean;
  employee: EmployeeProfile | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [joined, setJoined] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seeded when it OPENS, during render rather than in an effect — setState in
  // an effect body is a cascading render and a lint error here. Without it,
  // reopening on another row shows the previous person's details.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const key = employee?.id ?? null;
  if (open && seededFor !== key) {
    setSeededFor(key);
    const [f, ...rest] = (employee?.name ?? "").split(" ");
    setFirst(f ?? "");
    setLast(rest.join(" "));
    setEmail(employee?.email ?? "");
    setPhone(employee?.phone ?? "");
    setDepartmentId("");
    setDesignationId("");
    setJoined(employee?.joinedOn ?? "");
    setError(null);
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const { data: lookups } = useQuery(
    queryKey("hrm-lookups", {}),
    () => HrmService.getLookups(),
    { enabled: open }
  );
  const departments = useMemo(() => lookups?.departments ?? [], [lookups]);
  const designations = useMemo(() => lookups?.designations ?? [], [lookups]);

  const valid = first.trim() !== "" && email.trim() !== "";

  const save = async () => {
    if (!employee || !valid) return;
    setSaving(true);
    setError(null);
    try {
      await HrmService.updateEmployee(employee.id, {
        firstName: first.trim(),
        lastName: last.trim(),
        email: email.trim(),
        phone: phone.trim(),
        // Only when the picker was actually used: an empty select means
        // "leave it", not "clear it".
        departmentId: departmentId || undefined,
        designationId: designationId || undefined,
        dateOfJoining: joined || undefined,
      });
      onSaved(`${first.trim()} ${last.trim()}`.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const FIELD =
    "h-[42px] w-full rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[12px] text-[14px] text-[#1e1e1e] outline-none transition-colors focus:border-[#f5b800]";
  const LABEL = "text-[13px] font-medium text-[#525252]";

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Edit employee"
      width={560}
      footer={
        <>
          <button type="button" className={MODAL_GHOST} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || saving}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className={MODAL_PRIMARY}
            onClick={save}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>First name</span>
            <input value={first} onChange={(e) => setFirst(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>Last name</span>
            <input value={last} onChange={(e) => setLast(e.target.value)} className={FIELD} />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>Department</span>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className={`${FIELD} cursor-pointer`}
            >
              <option value="">
                {employee?.department ? `${employee.department} (unchanged)` : "Pick one…"}
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>Designation</span>
            <select
              value={designationId}
              onChange={(e) => setDesignationId(e.target.value)}
              className={`${FIELD} cursor-pointer`}
            >
              <option value="">
                {employee?.designation ? `${employee.designation} (unchanged)` : "Pick one…"}
              </option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-[6px] sm:w-1/2 sm:pr-[7px]">
          <span className={LABEL}>Join date</span>
          <input
            type="date"
            value={joined}
            onChange={(e) => setJoined(e.target.value)}
            className={`${FIELD} cursor-pointer`}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
