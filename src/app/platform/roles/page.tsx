"use client";

import React, { useMemo, useState } from "react";
import { ApiError } from "@/services/apiClient";
import { PlatformRoleRow, PlatformService } from "@/services/platformService";
import { invalidate, useQuery } from "@/lib/query/useQuery";
import ConsoleList, { Column, Stat } from "@/components/platform/ConsoleList";
import StatusPill from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { statGood, statTotal, statWait } from "@/components/platform/stats";
import {
  ActionButton,
  PlusIcon,
} from "@/components/shared/Toolbar";

/**
 * What a console account can be given.
 *
 * There was no such screen and no such endpoint. `PlatformRole` and its four
 * seeded rows have existed since console RBAC was written, and the only way to
 * change one was to edit `apps/platform/registry.py` and run a migration —
 * against production.
 *
 * Editing a role and managing staff are the SAME power: whoever can put a code
 * into a role can put `staff.create` into the role they already hold. So both
 * are held by Platform Owner alone, and a Platform Admin reaching this page
 * sees it read-only rather than a 403 on a menu entry they were offered.
 */

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800] disabled:bg-[#fafafa] disabled:text-[#8f8d87]";
/** The same tracks as `columns` below, as a literal so Tailwind emits the class. */
const GRID = "grid-cols-[1.2fr_2fr_130px_130px_83px]";

/**
 * Platform Owner must keep these, and the server refuses an edit that drops
 * one. Shown here so the reason is on screen rather than only in the refusal.
 */
const OWNER_REQUIRED = ["staff.create", "staff.update", "role.create", "role.update"];

/** `tenant.view` -> "tenant". The module is how the picker is grouped. */
function moduleOf(code: string): string {
  return code.split(".")[0];
}

interface Draft {
  name: string;
  description: string;
  permissions: string[];
}

export default function PlatformRolesPage() {
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ draft: Draft; existing?: PlatformRoleRow } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, loading, fetching, error, refetch } = useQuery("platform-roles", () =>
    PlatformService.listPlatformRoles()
  );
  // `data ?? []` inline would be a NEW array on every render, so the memo
  // below that walks it would recompute every time. Memoised on `data`, which
  // only changes when the query answers again.
  const rows = useMemo(() => data ?? [], [data]);

  /**
   * Every code the console knows about.
   *
   * The union across roles, because Platform Owner holds all of them by
   * definition — so this cannot drift from what a role is allowed to hold, and
   * it costs no second request.
   */
  const catalogue = useMemo(() => {
    const all = Array.from(new Set(rows.flatMap((r) => r.permissions))).sort();
    const grouped = new Map<string, string[]>();
    for (const code of all) {
      const list = grouped.get(moduleOf(code)) ?? [];
      list.push(code);
      grouped.set(moduleOf(code), list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.description.toLowerCase().includes(needle) ||
          r.permissions.some((p) => p.includes(needle))
      )
    : rows;

  const open = (role?: PlatformRoleRow) => {
    setFormError(null);
    setEditing(
      role
        ? {
            existing: role,
            draft: {
              name: role.name,
              description: role.description,
              permissions: [...role.permissions],
            },
          }
        : { draft: { name: "", description: "", permissions: [] } }
    );
  };

  const toggle = (code: string) => {
    if (!editing) return;
    const held = editing.draft.permissions.includes(code);
    setEditing({
      ...editing,
      draft: {
        ...editing.draft,
        permissions: held
          ? editing.draft.permissions.filter((c) => c !== code)
          : [...editing.draft.permissions, code],
      },
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      await PlatformService.savePlatformRole(editing.draft, editing.existing?.id);
      setNote(
        editing.existing ? `${editing.draft.name} updated.` : `${editing.draft.name} created.`
      );
      setEditing(null);
      // The staff screen names roles and the staff form offers them, so both
      // go stale the moment one changes.
      invalidate("platform-roles", "platform-staff");
    } catch (e) {
      setFormError(PlatformService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<PlatformRoleRow>[] = [
    {
      key: "name",
      label: "Role",
      width: "1.2fr",
      mobile: true,
      cell: (r) => <span className="truncate text-[14px] font-medium text-[#1e1e1e]">{r.name}</span>,
    },
    {
      key: "description",
      label: "What it is for",
      width: "2fr",
      mobile: true,
      cell: (r) => <span className={`${BODY} truncate`}>{r.description || "—"}</span>,
    },
    {
      key: "count",
      label: "Permissions",
      width: "130px",
      align: "center",
      mobile: true,
      cell: (r) => <span className={BODY}>{r.permissions.length}</span>,
    },
    {
      key: "kind",
      label: "Kind",
      width: "130px",
      align: "center",
      cell: (r) => (
        <StatusPill label={r.isSystem ? "Built-in" : "Custom"} tone={r.isSystem ? "gold" : "green"} />
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
          // No delete. A role with holders is a live grant and deleting it
          // would silently strip everybody on it; one nobody holds costs
          // nothing to leave. Emptying its permissions is the operation.
          actions={[{ label: "Edit permissions", onSelect: () => open(r) }]}
        />
      ),
    },
  ];

  const stats: Stat[] = [
    statTotal({ label: "Roles", value: rows.length }),
    statGood({
      label: "Built-in",
      value: rows.filter((r) => r.isSystem).length,
      note: "seeded, cannot be renamed",
    }),
    statWait({
      label: "Custom",
      value: rows.filter((r) => !r.isSystem).length,
      note: "made in this console",
    }),
  ];

  const draft = editing?.draft;
  const isOwnerRole = editing?.existing?.name === "Platform Owner";
  const missingOwnerCodes = isOwnerRole
    ? OWNER_REQUIRED.filter((c) => !draft?.permissions.includes(c))
    : [];
  const canSave = Boolean(draft && draft.name.trim() && missingOwnerCodes.length === 0);

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
        error={error ? (error instanceof ApiError ? error.message : "Could not load roles.") : null}
        onRetry={refetch}
        note={note}
        onSearch={setSearch}
        searchPlaceholder="Search roles or permission codes..."
        minWidth={1000}
        emptyLine="No roles set up."
        actions={
          <ActionButton variant="primary" onClick={() => open()}>
            <PlusIcon />
            New role
          </ActionButton>
        }
      />

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.existing ? `Edit ${editing.existing.name}` : "New role"}
        width={620}
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
              onClick={save}
            >
              {saving ? "Saving..." : editing?.existing ? "Save changes" : "Create role"}
            </button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-[14px]">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Name</span>
              <input
                value={draft.name}
                disabled={editing?.existing?.isSystem}
                onChange={(e) =>
                  setEditing({ ...editing!, draft: { ...draft, name: e.target.value } })
                }
                className={FIELD}
                placeholder="Support lead"
              />
              {editing?.existing?.isSystem && (
                <span className="text-[12px] leading-[1.4] text-[#8f8d87]">
                  A built-in role keeps its name — the console looks it up by
                  name. Its permissions and description can still be changed.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">What it is for</span>
              <input
                value={draft.description}
                onChange={(e) =>
                  setEditing({ ...editing!, draft: { ...draft, description: e.target.value } })
                }
                className={FIELD}
                placeholder="Reads everything, changes nothing."
              />
            </label>

            <div className="flex flex-col gap-[10px]">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-[#1e1e1e]">Permissions</span>
                <span className="text-[12px] text-[#8f8d87]">
                  {draft.permissions.length} of{" "}
                  {catalogue.reduce((n, [, codes]) => n + codes.length, 0)}
                </span>
              </div>

              <div className="flex max-h-[280px] flex-col gap-[12px] overflow-y-auto rounded-[10px] border border-solid border-[#eaeaea] p-[12px]">
                {catalogue.map(([module, codes]) => (
                  <div key={module} className="flex flex-col gap-[6px]">
                    <span className="text-[12px] font-semibold tracking-[0.4px] text-[#8f8d87] uppercase">
                      {module}
                    </span>
                    {codes.map((code) => {
                      const required = isOwnerRole && OWNER_REQUIRED.includes(code);
                      return (
                        <label
                          key={code}
                          className="flex cursor-pointer items-center gap-[10px] text-[13px] text-[#1e1e1e]"
                        >
                          <input
                            type="checkbox"
                            checked={draft.permissions.includes(code)}
                            onChange={() => toggle(code)}
                            className="size-[16px] accent-[#f5b800]"
                          />
                          <span>{code}</span>
                          {required && (
                            <span className="text-[11px] text-[#a02620]">required</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>

              {isOwnerRole && (
                <p className="text-[12px] leading-[1.5] text-[#8f8d87]">
                  Platform Owner must keep {OWNER_REQUIRED.join(", ")}. They live
                  in this role and nowhere else, so without them no account could
                  ever mint staff or edit a role again.
                </p>
              )}
              {missingOwnerCodes.length > 0 && (
                <p role="alert" className="text-[12px] font-medium text-[#a02620]">
                  Put {missingOwnerCodes.join(", ")} back before saving.
                </p>
              )}
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
