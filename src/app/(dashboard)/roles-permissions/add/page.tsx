"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RoleService, RoleOption } from "@/services/roleService";
import { HrmService } from "@/services/hrmService";
import { BranchService } from "@/services/branchService";
import { tokenStore } from "@/services/apiClient";
import { EmployeeRecord } from "@/types/hrm";
import { Branch } from "@/types/branch";
import { GOLD_GRADIENT } from "@/components/shared/Modal";
import { useQuery, queryKey, useMutation } from "@/lib/query/useQuery";
import { FormSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";

/**
 * Add User — Figma 76:8029.
 *
 * A 565px card centred on the page: a title strip, then 56px fields at 12px
 * apart, and a full-width gold submit below the card. Picking an employee
 * fills the contact details, because the person already exists in HRM.
 *
 * Branch is asked for, and it is not cosmetic: it decides whose staff list
 * this person appears in. Left as "whole company" they are org-wide and show
 * up in every branch, which is right for an owner or an accountant and wrong
 * for a cashier. The picker only offers branches the server says this
 * administrator may act in — naming another one is a 404, by design.
 */

const LABEL = "w-full text-[18px] leading-[24px] font-medium text-[#525252]";
const INPUT =
  "flex h-[56px] w-full items-center rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[8px] text-[16px] leading-[24px] text-[#525252] outline-none placeholder:text-[#525252] focus:border-[#f5b800]";

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A 56px box that opens a list; typing filters it. */
function PickerField({
  label,
  value,
  onChange,
  onPick,
  placeholder,
  options,
  caret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onPick?: (name: string) => void;
  placeholder: string;
  options: string[];
  caret?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const matches = options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase()));

  return (
    <div className="flex w-full flex-col gap-[8px]">
      <label className={LABEL} htmlFor={label}>
        {label}
      </label>
      <div ref={ref} className="relative w-full">
        <div className={`${INPUT} gap-[12px] focus-within:border-[#f5b800]`}>
          <input
            id={label}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#525252]"
          />
          {caret && (
            <button
              type="button"
              aria-label={`Choose ${label.toLowerCase()}`}
              onClick={() => setOpen((v) => !v)}
              className="shrink-0 cursor-pointer text-[#525252]"
            >
              <CaretIcon open={open} />
            </button>
          )}
        </div>

        {open && matches.length > 0 && (
          <ul
            role="listbox"
            className="absolute top-[60px] right-0 left-0 z-30 max-h-[220px] overflow-y-auto rounded-[12px] border border-[#eaeaea] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
          >
            {matches.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o === value}
                  onClick={() => {
                    onChange(o);
                    onPick?.(o);
                    setOpen(false);
                  }}
                  className="w-full cursor-pointer px-[16px] py-[10px] text-left text-[15px] text-[#525252] transition-colors hover:bg-[#fdf7e6]"
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AddUserPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Four lists, four cache entries under the prefixes the screens that own
  // them invalidate — so adding an employee on /hrm refreshes this picker
  // rather than leaving it a page behind.
  const employeeQuery = useQuery(queryKey("employees", { limit: 500 }), () =>
    HrmService.getEmployees({ limit: 500 })
  );
  const roleQuery = useQuery(queryKey("roles", { part: "options" }), () =>
    RoleService.getRoles()
  );
  const lookupQuery = useQuery(queryKey("employees", { part: "lookups" }), () =>
    HrmService.getLookups()
  );
  const branchQuery = useQuery(queryKey("branches"), () => BranchService.list());

  const employees: EmployeeRecord[] = employeeQuery.data?.data ?? [];
  const roles: RoleOption[] = roleQuery.data ?? [];
  const departments: string[] = (lookupQuery.data?.departments ?? []).map((d) => d.name);
  const branches: Branch[] = branchQuery.data ?? [];

  // Default to the branch this administrator is standing in — the branch whose
  // list they were looking at when they pressed Add New. Derived rather than
  // written into state by an effect, so the select is never briefly wrong; the
  // moment a branch is chosen by hand, `branchId` wins.
  const active = tokenStore.branch();
  const selectedBranch =
    branchId || (active && branches.some((b) => b.id === active) ? active : "");

  const { mutate: createUser, pending: saving } = useMutation(
    (payload: Parameters<typeof RoleService.createUser>[0]) => RoleService.createUser(payload),
    // The new account belongs in the user directory straight away.
    { invalidates: ["roles"] }
  );

  const optionsLoading =
    employeeQuery.loading || roleQuery.loading || lookupQuery.loading || branchQuery.loading;
  const optionsError =
    employeeQuery.error ?? roleQuery.error ?? lookupQuery.error ?? branchQuery.error;
  const optionsReady =
    employeeQuery.data !== undefined &&
    roleQuery.data !== undefined &&
    lookupQuery.data !== undefined &&
    branchQuery.data !== undefined;

  /** Picking somebody from HRM fills in what HRM already knows about them. */
  const fillFromEmployee = (name: string) => {
    const match = employees.find((e) => e.name === name);
    if (!match) return;
    setDepartment(match.department);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createUser({
        name: employee,
        phone,
        mail: email,
        role,
        branchId: selectedBranch || undefined,
      });
      router.push("/roles-permissions");
    } catch (err) {
      setError(RoleService.describeError(err));
    }
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col items-center">
      <div className="flex w-full max-w-[720px] flex-col gap-[24px]">
        {/* Card — 76:8564 */}
        <div className="flex w-full flex-col items-center gap-[9px] overflow-hidden rounded-[10px] border border-solid border-[#eaeaea] bg-white pb-[16px]">
          <div className="flex w-full items-center justify-center border-b border-solid border-[#eaeaea] px-[16px] pt-[16px] pb-[8px]">
            <h1 className="text-[20px] leading-[28px] font-semibold tracking-[-0.4px] text-[#1e1e1e]">
              Add User
            </h1>
          </div>

          <div className="relative flex w-full flex-col gap-[12px] px-[16px]">
            <RefreshBar
              active={
                employeeQuery.fetching ||
                roleQuery.fetching ||
                lookupQuery.fetching ||
                branchQuery.fetching
              }
            />
            <QueryBoundary
              loading={optionsLoading}
              error={optionsError}
              hasData={optionsReady}
              skeleton={<FormSkeleton fields={6} columns={1} />}
              errorMessage="The employee, role and branch lists could not be loaded."
              onRetry={() => {
                void employeeQuery.refetch();
                void roleQuery.refetch();
                void lookupQuery.refetch();
                void branchQuery.refetch();
              }}
            >
            {error && (
              <p role="alert" className="rounded-[8px] bg-[#ffdfe2] px-[12px] py-[8px] text-[13px] text-[#e63946]">
                {error}
              </p>
            )}

            <PickerField
              label="Select Employee"
              value={employee}
              onChange={setEmployee}
              onPick={fillFromEmployee}
              placeholder="Select Employee"
              options={employees.map((e) => e.name)}
              caret
            />

            <div className="flex w-full flex-col gap-[8px]">
              <label className={LABEL} htmlFor="user-phone">
                Phone Number
              </label>
              <input
                id="user-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter supplier phone number"
                className={INPUT}
              />
            </div>

            <div className="flex w-full flex-col gap-[8px]">
              <label className={LABEL} htmlFor="user-email">
                Email Address
              </label>
              <input
                id="user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                className={INPUT}
              />
            </div>

            <PickerField
              label="Role"
              value={role}
              onChange={setRole}
              placeholder="Select Role"
              options={roles.map((r) => r.name)}
              caret
            />

            <div className="flex w-full flex-col gap-[8px]">
              <label className={LABEL} htmlFor="user-branch">
                Branch
              </label>
              <select
                id="user-branch"
                value={selectedBranch}
                onChange={(e) => setBranchId(e.target.value)}
                className={`${INPUT} cursor-pointer`}
              >
                <option value="">Whole company (no branch)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </select>
              <p className="text-[13px] leading-[1.5] text-[#525252]">
                They appear in this branch&apos;s user list. &ldquo;Whole company&rdquo; is for
                head-office accounts, who appear in every branch.
              </p>
            </div>

            <PickerField
              label="Department"
              value={department}
              onChange={setDepartment}
              placeholder="Select department"
              options={departments}
            />
            </QueryBoundary>
          </div>
        </div>

        {/* Submit — 76:8596 */}
        <button
          type="submit"
          disabled={saving}
          style={{ backgroundImage: GOLD_GRADIENT }}
          className="flex w-full cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Adding..." : "Add User"}
        </button>

        <p className="text-center text-[13px] text-[#525252]">
          The new user gets an email with a link to set their own password.
        </p>
      </div>
    </form>
  );
}
