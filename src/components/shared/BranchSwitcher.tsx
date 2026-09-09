"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BranchService } from "@/services/branchService";
import { tokenStore } from "@/services/apiClient";
import { Branch, CreateBranchPayload } from "@/types/branch";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { useSession } from "@/services/useSession";
import { atPlanLimit } from "@/services/authService";

/**
 * The branch the dashboard reports on, and the way to add another.
 *
 * Switching is a server-side act, not a filter: the new token carries that
 * branch's permissions, so the figures and what the user may do change
 * together. "Whole company" clears it.
 */

/**
 * No local cache of branches, deliberately.
 *
 * There used to be one, module-level, holding every branch this browser had
 * ever been shown — because `/branches/` narrowed to the branch you were
 * standing in, so picking one left no way back. The server now scopes that
 * list to the caller's ASSIGNMENTS instead of their cursor, which is the real
 * fix; the cache was also a leak, since it outlived a sign-out and could show
 * the previous account's branch names to the next person at the till.
 */

/**
 * Nothing mutates the stored branch behind this component's back — a switch
 * reloads the page — so the subscription never fires. It exists to satisfy the
 * store contract, and being module-level keeps its identity stable.
 */
const NO_STORE_UPDATES = () => () => {};
const readStoredBranch = () => tokenStore.branch();
const readNoBranch = () => null;

export default function BranchSwitcher({ onChange }: { onChange?: (branchId: string | null) => void }) {
  const [picked, setPicked] = useState<string | null | undefined>(undefined);

  /**
   * Only for people who administer branches.
   *
   * Switching is not a view filter — it writes the active branch onto the
   * server session and re-issues the token, so every branch-scoped list in the
   * app answers differently afterwards. A cashier standing at one till has no
   * business moving the company's cursor, and gating on `branch.view` rather
   * than on a role NAME keeps that true after a shop renames its roles.
   */
  const { user: session, loading: sessionLoading } = useSession();
  // Read once, so the JSX below reads as a question about the plan rather than
  // as four lookups.
  const branchesFull = atPlanLimit(session?.subscription, "max_branches");
  const planBranches = session?.subscription?.limits?.max_branches ?? 0;
  const planName = session?.subscription?.planName || "this plan";
  const maySwitch = Boolean(session?.permissions?.includes("branch.view"));
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * The switcher sits in the header, so it mounts on every navigation. Asking
   * for the branch list each time was one request per page view for a list
   * that changes when somebody provisions a branch — minutes apart at most.
   *
   * Five minutes stale, and `invalidate("branches")` after a create makes a
   * new branch appear without waiting for it to expire.
   */
  const {
    data: branchRows,
    error: listError,
    refetch: refetchBranches,
  } = useQuery(queryKey("branches"), () => BranchService.list(), {
    staleMs: 300_000,
    enabled: maySwitch,
  });
  const branches = branchRows ?? [];

  /**
   * The active branch lives in localStorage, which does not exist while the
   * server renders — hence the third argument. Reading it through a store
   * subscription rather than copying it into state in an effect keeps the
   * first client paint correct without a second render.
   */
  const stored = useSyncExternalStore(NO_STORE_UPDATES, readStoredBranch, readNoBranch);
  const activeId = picked === undefined ? stored : picked;

  const error = localError ?? (listError ? BranchService.describeError(listError) : null);

  // Close on outside click and on Escape — a dropdown that traps the page is
  // worse than no dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = async (branchId: string | null) => {
    setOpen(false);
    setSwitching(true);
    setLocalError(null);
    try {
      await BranchService.setActive(branchId);
      setPicked(branchId);
      onChange?.(branchId);
    } catch (e) {
      setLocalError(BranchService.describeError(e));
    } finally {
      setSwitching(false);
    }
  };

  const onCreated = async (branch: Branch) => {
    setModalOpen(false);
    try {
      // Straight through the cache, so the header this component sits in and
      // anything else reading `branches` gets the new row too.
      invalidate("branches");
      const rows = (await refetchBranches()) ?? [];

      // A branch you just created can be invisible: the list is scoped to the
      // branches you are ASSIGNED to, and creating one does not assign you.
      if (!rows.some((b) => b.id === branch.id)) {
        setLocalError(
          `${branch.code} was created, but you are not assigned to it yet, so it is not listed. Add yourself to it under Users.`
        );
        return;
      }
      await select(branch.id);
    } catch (e) {
      setLocalError(BranchService.describeError(e));
    }
  };

  const active = branches.find((b) => b.id === activeId);
  const label = switching ? "Switching…" : active ? `${active.code} · ${active.name}` : "Choose a branch";

  // Nothing at all, rather than a disabled control: a cashier who cannot
  // switch is better served by the header not offering it. Held back while the
  // session is still loading too, so the control does not appear and vanish.
  if (sessionLoading || !maySwitch) return null;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 select-none md:flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-[48px] w-full min-w-0 cursor-pointer items-center justify-between gap-[12px] rounded-[12px] border border-[#e5e5e5] bg-white px-[14px] transition-colors hover:border-[#f5b800] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b800] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto md:min-w-[210px]"
      >
        <span className="flex min-w-0 items-center gap-[10px]">
          <StoreIcon />
          <span className="truncate text-[14px] font-medium text-[#1e1e1e]">{label}</span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          role="listbox"
          /* Anchored to whichever edge has room. Below md the only live copy
             of this control is the one in the sidebar, hard against the LEFT
             of the screen — a right-anchored 260px panel there starts at -36px
             and the first third of every branch name is off the screen. From
             md up it is back in the header at the right, where the opposite is
             true. */
          className="absolute left-0 z-40 mt-[6px] w-[260px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[12px] border border-[#e5e5e5] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)] md:right-0 md:left-auto"
        >
          <p className="px-[14px] pt-[10px] pb-[6px] text-[11px] font-medium tracking-[0.06em] text-[#8a8a8a] uppercase">
            Showing figures for
          </p>
          <ul className="max-h-[260px] overflow-y-auto pb-[6px]">
            {branches.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={b.id === activeId}
                  onClick={() => select(b.id)}
                  className={`flex w-full cursor-pointer items-center gap-[10px] px-[14px] py-[10px] text-left text-[14px] transition-colors hover:bg-[#fdf7e6] ${
                    b.id === activeId ? "bg-[#fdf7e6] font-semibold text-[#1e1e1e]" : "text-[#525252]"
                  }`}
                >
                  <span className="shrink-0 rounded-[5px] bg-[#f0f0f0] px-[7px] py-[2px] font-mono text-[11px] font-medium text-[#525252]">
                    {b.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {b.id === activeId && <TickIcon />}
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-[#e5e5e5] p-[8px]">
            {/*
              The ceiling is checked BEFORE the form opens.
              `/auth/me` has carried `subscription.limits` and `usage` since
              plan limits were built and nothing read them, so the only way to
              find out you were at your branch ceiling was to fill the form in
              and be refused by the API — after typing a code, a name, a phone
              number and an address.

              The server is still the authority; this only decides whether to
              offer the button, and says what to do instead.
            */}
            {branchesFull ? (
              <div className="flex flex-col gap-[6px] px-[12px] py-[10px]">
                <span className="text-[13px] font-medium text-[#1e1e1e]">
                  You are using all {planBranches} branch
                  {planBranches === 1 ? "" : "es"} on {planName}.
                </span>
                <Link
                  href="/settings?upgrade=1"
                  onClick={() => setOpen(false)}
                  className="text-[13px] font-semibold text-[#f5b800]"
                >
                  Upgrade to add more →
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setModalOpen(true);
                }}
                className="flex w-full cursor-pointer items-center gap-[9px] rounded-[8px] px-[12px] py-[10px] text-left text-[14px] font-medium text-[#1e1e1e] transition-colors hover:bg-[#fdf7e6]"
              >
                <PlusIcon />
                Add branch
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="absolute right-0 top-[52px] z-30 max-w-[280px] text-[12px] text-[#a02620]">
          {error}
        </p>
      )}

      {modalOpen && <AddBranchModal onClose={() => setModalOpen(false)} onCreated={onCreated} />}
    </div>
  );
}

function AddBranchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (branch: Branch) => void;
}) {
  // Mounted only while open, so every open starts fresh with no reset effect.
  const [form, setForm] = useState<CreateBranchPayload>({ code: "", name: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setError("A code and a name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onCreated(await BranchService.create(form));
    } catch (err) {
      setError(BranchService.describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof CreateBranchPayload) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-[16px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-branch-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-[16px] bg-white p-[24px] shadow-[0_24px_64px_rgba(0,0,0,0.24)]"
      >
        <h2 id="add-branch-title" className="text-[20px] font-medium tracking-[-0.4px] text-[#1e1e1e]">
          Add branch
        </h2>
        <p className="mt-[4px] text-[13px] leading-[1.5] text-[#525252]">
          Its main and transit warehouses are created with it, so it can receive stock straight away.
        </p>

        <form onSubmit={submit} className="mt-[20px] flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[14px] sm:flex-row sm:gap-[12px]">
            <LabelledInput
              label="Code"
              required
              value={form.code}
              onChange={set("code")}
              placeholder="CTG"
              maxLength={20}
            />
            <LabelledInput
              label="Name"
              required
              value={form.name}
              onChange={set("name")}
              placeholder="Chattogram"
            />
          </div>
          <LabelledInput label="Phone" value={form.phone || ""} onChange={set("phone")} placeholder="+8801700000000" />
          <LabelledInput label="Address" value={form.address || ""} onChange={set("address")} placeholder="Street, city" />

          {error && (
            <p role="alert" className="text-[13px] text-[#a02620]">
              {error}
            </p>
          )}

          <div className="mt-[6px] flex justify-end gap-[10px]">
            <button
              type="button"
              onClick={onClose}
              className="h-[44px] cursor-pointer rounded-[10px] border border-[#e5e5e5] px-[18px] text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#f5f5f5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-[44px] cursor-pointer rounded-[10px] bg-[#1e1e1e] px-[20px] text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create branch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LabelledInput({
  label,
  required,
  className = "",
  ...rest
}: { label: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    // min-w-0 keeps the field inside the row: a flex item will not otherwise
    // shrink below its content, and two side by side overflow.
    <label className={`flex min-w-0 flex-1 flex-col gap-[6px] ${className}`}>
      <span className="text-[13px] font-medium text-[#525252]">
        {label}
        {required && <span className="text-[#a02620]"> *</span>}
      </span>
      <input
        {...rest}
        className="h-[44px] w-full min-w-0 rounded-[10px] border border-[#e5e5e5] px-[12px] text-[14px] text-[#1e1e1e] outline-none transition-colors focus:border-[#f5b800] focus:ring-2 focus:ring-[#fdf1cc]"
      />
    </label>
  );
}

/* Small inline icons — no icon library is loaded. */

function StoreIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M3 9.5 4.5 4h15L21 9.5M3 9.5h18M3 9.5v9A1.5 1.5 0 0 0 4.5 20h15a1.5 1.5 0 0 0 1.5-1.5v-9M8 9.5a2 2 0 1 1-4 0m8 0a2 2 0 1 1-4 0m8 0a2 2 0 1 1-4 0m8 0a2 2 0 1 1-4 0"
        stroke="#f5b800"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" stroke="#737373" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="m5 13 4 4L19 7" stroke="#1c6b45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M12 5v14M5 12h14" stroke="#f5b800" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
