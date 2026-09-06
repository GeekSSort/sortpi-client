"use client";

import React, { useEffect, useMemo, useState } from "react";
import { RoleService } from "@/services/roleService";
import { BranchService } from "@/services/branchService";
import { Branch } from "@/types/branch";
import {
  PermissionRecord,
  RoleRecord,
  groupPermissions,
} from "@/types/permissions";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";

/**
 * Create or edit a role: what its holders can do, and whose data they can see.
 *
 * Two halves, and they are different kinds of thing:
 *
 * - Permissions are what the role may DO. Shown as pages, because "can this
 *   person open Payroll?" is the question an owner is answering; every page
 *   expands to the exact codes the server enforces, so the abstraction never
 *   hides what is being granted.
 * - Branches are whose data the role may SEE, on top of wherever its holder is
 *   standing. Empty is the normal case and the safe one. This half widens read
 *   scope for every holder, so the server refuses a branch the author cannot
 *   reach themselves — the picker only lists branches they can, and naming one
 *   outside it is a 404 rather than a 403.
 *
 * Nothing here is protection. Every code and every branch is enforced again
 * server-side; this decides what is offered, not what is allowed.
 */

const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`shrink-0 text-[#8a8a8a] transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A tick-box that can also be "some of the codes below". */
function TriBox({
  state,
  onToggle,
  label,
}: {
  state: "none" | "some" | "all";
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      onClick={onToggle}
      className={`flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] transition-colors ${
        state === "none"
          ? "bg-white shadow-[inset_0_0_0_1.5px_#d4d4d4]"
          : "bg-[#f5b800] shadow-[inset_0_0_0_1.5px_#f5b800]"
      }`}
    >
      {state === "all" && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="m5 13 4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === "some" && <span className="block h-[2px] w-[9px] rounded-full bg-white" />}
    </button>
  );
}

export default function RoleEditor({
  role,
  onClose,
  onSaved,
}: {
  /** null creates a new role; a record edits that one. */
  role: RoleRecord | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [codes, setCodes] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [branchIds, setBranchIds] = useState<Set<string>>(new Set(role?.branches ?? []));
  const [catalogue, setCatalogue] = useState<PermissionRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [permissions, branchList] = await Promise.all([
          RoleService.getPermissions(),
          // Only the branches this administrator may act in. The server
          // decides that; offering more would just produce a 404 on save.
          BranchService.list().catch(() => [] as Branch[]),
        ]);
        if (cancelled) return;
        setCatalogue(permissions);
        setBranches(branchList);
      } catch (e) {
        if (!cancelled) setError(RoleService.describeError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => groupPermissions(catalogue), [catalogue]);

  const stateOf = (groupCodes: PermissionRecord[]): "none" | "some" | "all" => {
    const held = groupCodes.filter((p) => codes.has(p.code)).length;
    if (held === 0) return "none";
    return held === groupCodes.length ? "all" : "some";
  };

  const toggleGroup = (groupCodes: PermissionRecord[]) => {
    const next = new Set(codes);
    // "Some" becomes "all" rather than "none": the click after a partial
    // selection means "give them the rest", not "take back what I set".
    const grantAll = stateOf(groupCodes) !== "all";
    for (const p of groupCodes) {
      if (grantAll) next.add(p.code);
      else next.delete(p.code);
    }
    setCodes(next);
  };

  const toggleCode = (code: string) => {
    const next = new Set(codes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setCodes(next);
  };

  const toggleBranch = (id: string) => {
    const next = new Set(branchIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setBranchIds(next);
  };

  const save = async () => {
    if (!name.trim()) {
      setError("A role needs a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        permissions: [...codes],
        branches: [...branchIds],
      };
      if (role) {
        await RoleService.updateRole(role.id, payload);
        onSaved(`${payload.name} updated.`);
      } else {
        await RoleService.createRole(payload);
        onSaved(`${payload.name} created.`);
      }
    } catch (e) {
      setError(RoleService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={role ? `Edit ${role.name}` : "New role"}
      width={620}
      footer={
        <>
          <button type="button" className={MODAL_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loading}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
            onClick={save}
          >
            {saving ? "Saving..." : role ? "Save changes" : "Create role"}
          </button>
        </>
      }
    >
      <div className="flex max-h-[62vh] flex-col gap-[18px] overflow-y-auto pr-[4px]">
        {error && (
          <p role="alert" className="rounded-[8px] bg-[#ffdfe2] px-[12px] py-[8px] text-[13px] text-[#a02620]">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-[12px] sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Role name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Regional Manager"
              className={FIELD}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Covers the southern branches"
              className={FIELD}
            />
          </label>
        </div>

        {role?.isSystem && (
          <p className="rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] leading-[1.5] text-[#6d5b46]">
            This is a built-in role. Its permissions and branches are yours to change; the role
            itself cannot be deleted, because every new account is given one by name.
          </p>
        )}

        {/* What the role may DO */}
        <section className="flex flex-col gap-[8px]">
          <div>
            <h3 className="text-[14px] font-medium text-[#1e1e1e]">Pages this role can use</h3>
            <p className="text-[13px] leading-[1.5] text-[#525252]">
              Tick a page for the whole thing, or open it to choose exact actions.
            </p>
          </div>

          {loading && <p className="py-[12px] text-[13px] text-[#525252]">Loading permissions...</p>}

          {!loading &&
            groups.map(({ group, codes: groupCodes }) => {
              const open = expanded === group.key;
              const held = groupCodes.filter((p) => codes.has(p.code)).length;
              return (
                <div key={group.key} className="rounded-[10px] shadow-[inset_0_0_0_1px_#eaeaea]">
                  <div className="flex items-center gap-[10px] px-[12px] py-[10px]">
                    <TriBox
                      state={stateOf(groupCodes)}
                      onToggle={() => toggleGroup(groupCodes)}
                      label={group.label}
                    />
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : group.key)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-[8px] text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-[#1e1e1e]">
                          {group.label}
                        </span>
                        <span className="block truncate text-[12px] text-[#8a8a8a]">
                          {group.hint}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] text-[#8a8a8a]">
                        {held}/{groupCodes.length}
                      </span>
                      <Caret open={open} />
                    </button>
                  </div>

                  {open && (
                    <ul className="grid gap-[2px] border-t border-[#eaeaea] px-[12px] py-[8px] sm:grid-cols-2">
                      {groupCodes.map((p) => (
                        <li key={p.code}>
                          <label className="flex cursor-pointer items-start gap-[8px] rounded-[6px] px-[6px] py-[5px] transition-colors hover:bg-[#fdf7e6]">
                            <input
                              type="checkbox"
                              checked={codes.has(p.code)}
                              onChange={() => toggleCode(p.code)}
                              className="mt-[3px] size-[14px] shrink-0 accent-[#f5b800]"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] text-[#1e1e1e]">
                                {p.description || p.code}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-[#8a8a8a]">
                                {p.code}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
        </section>

        {/* Whose data the role may SEE */}
        <section className="flex flex-col gap-[8px]">
          <div>
            <h3 className="text-[14px] font-medium text-[#1e1e1e]">Branch data this role can see</h3>
            <p className="text-[13px] leading-[1.5] text-[#525252]">
              Holders always see the branch they are standing in. Tick another to let them see it
              as well — that is how one role covers several branches. Leave every box clear and
              nothing is widened, which is the usual answer.
            </p>
          </div>

          {branches.length === 0 && !loading && (
            <p className="text-[13px] text-[#525252]">No branches you can grant.</p>
          )}

          <ul className="grid gap-[2px] sm:grid-cols-2">
            {branches.map((b) => (
              <li key={b.id}>
                <label className="flex cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[7px] transition-colors hover:bg-[#fdf7e6]">
                  <input
                    type="checkbox"
                    checked={branchIds.has(b.id)}
                    onChange={() => toggleBranch(b.id)}
                    className="size-[14px] shrink-0 accent-[#f5b800]"
                  />
                  <span className="shrink-0 rounded-[5px] bg-[#f0f0f0] px-[7px] py-[2px] font-mono text-[11px] font-medium text-[#525252]">
                    {b.code}
                  </span>
                  <span className="min-w-0 truncate text-[13px] text-[#1e1e1e]">{b.name}</span>
                </label>
              </li>
            ))}
          </ul>

          {branchIds.size > 0 && (
            <p className="rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] leading-[1.5] text-[#6d5b46]">
              Everybody holding this role will be able to read {branchIds.size} branch
              {branchIds.size === 1 ? "" : "es"} beyond their own — sales, stock, staff and reports.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
