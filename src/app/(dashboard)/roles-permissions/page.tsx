"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SystemUserRecord } from "@/types/roles";
import { RoleRecord } from "@/types/permissions";
import { RoleService, RoleOption } from "@/services/roleService";
import { useSession } from "@/services/useSession";
import RoleEditor from "@/components/modules/dashboard/RoleEditor";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";

/**
 * User List — Figma 59:18134.
 *
 * Eight columns: # 50, User Name 170, Phone and Mail share, Role 135, Last
 * Login shares, Status 100, Action 83. Rows 54 tall with 12px cells. Below md
 * the grid cannot hold them, so each row becomes a card.
 *
 * This screen is a staff directory, so it is the one most worth getting the
 * scoping right on. It shows exactly what the server sends and never widens
 * it: the API scopes on two axes — the caller's own organization, and the
 * branch they are standing in — and searching, filtering and paging all happen
 * there too. Nothing here merges branches, caches a wider list, or filters a
 * bigger fetch down; the strip below the search box names the branch being
 * shown, because a correctly narrowed list is indistinguishable from missing
 * data unless you say so.
 *
 * The action menu is gated on the same permission codes the server enforces.
 * That is presentation, not protection — every one of these calls is refused
 * server-side without the code — but offering a button that always fails is
 * its own kind of bug.
 */

const GRID = "grid-cols-[50px_170px_1fr_1fr_135px_1fr_100px_83px]";
const CELL = "flex items-center px-[12px]";
const HEAD =
  "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e] whitespace-nowrap";
const BODY =
  "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252] whitespace-nowrap";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";

const STATUS_TONE: Record<SystemUserRecord["status"], Tone> = {
  Active: "green",
  Inactive: "rose",
};

const FILTERS = ["All Users", "Active", "Inactive"] as const;

/** Long enough that typing a name is one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 300;

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0">
      <path d="M2.25 4.5h13.5M4.5 9h9m-6.75 4.5h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m5.5 7.75 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M10 4.375v11.25M4.375 10h11.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function RolesPermissionsPage() {
  const { user, loading: sessionLoading } = useSession();
  const [rows, setRows] = useState<SystemUserRecord[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All Users");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [loading, setLoading] = useState(true);
  // Two different things, and merging them ate one of them: `note` is what an
  // action just did ("Rahim deactivated."), `loadError` is why the list on
  // screen is empty. Sharing one state meant the refetch an action triggers
  // cleared the confirmation that action had just set.
  const [note, setNote] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [roleOf, setRoleOf] = useState<SystemUserRecord | null>(null);
  const [nextRole, setNextRole] = useState("");
  const [dropOf, setDropOf] = useState<SystemUserRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [roleRecords, setRoleRecords] = useState<RoleRecord[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [editing, setEditing] = useState<RoleRecord | null | undefined>(undefined);
  const [rolesKey, setRolesKey] = useState(0);
  const filterRef = useRef<HTMLDivElement>(null);

  const can = useMemo(() => {
    const held = new Set(user?.permissions ?? []);
    return {
      view: held.has("user.view"),
      create: held.has("user.create"),
      update: held.has("user.update"),
      remove: held.has("user.delete"),
      viewRoles: held.has("role.view"),
      createRole: held.has("role.create"),
      updateRole: held.has("role.update"),
      deleteRole: held.has("role.delete"),
    };
  }, [user]);

  // One request per pause in typing, not one per keystroke: the search runs on
  // the server now, so every character was a round trip and the answers could
  // arrive out of order.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!can.view) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await RoleService.getUsers({
          search: search || undefined,
          status: filter === "All Users" ? undefined : filter,
          page,
          limit: pageSize,
        });
        if (cancelled) return;
        setRows(res.data);
        setTotal(res.total);
        setLoadError(null);
      } catch (e) {
        if (cancelled) return;
        // A failed read must not leave the previous branch's rows on screen.
        setRows([]);
        setTotal(0);
        setLoadError(RoleService.describeError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search, filter, page, pageSize, reloadKey, sessionLoading, can.view]);

  useEffect(() => {
    if (sessionLoading || !can.view) return;
    let cancelled = false;
    RoleService.getRoles()
      .then((r) => !cancelled && setRoles(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, can.view]);

  useEffect(() => {
    if (tab !== "roles" || !can.viewRoles) return;
    let cancelled = false;
    setRolesLoading(true);
    RoleService.getRoleRecords()
      .then((r) => !cancelled && setRoleRecords(r))
      .catch((e) => !cancelled && setNote(RoleService.describeError(e)))
      .finally(() => !cancelled && setRolesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, can.viewRoles, rolesKey]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFilterOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  const act = async (fn: () => Promise<void>, done: string) => {
    setSaving(true);
    try {
      await fn();
      setNote(done);
      setRoleOf(null);
      setDropOf(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setNote(RoleService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Seeded from the role NAMES, never from the Role column.
   *
   * That column shows "Branch Manager +1", and splitting it on a space gave
   * "Branch" — which matches no role, so the select opened blank and Save
   * stayed disabled for anybody holding a two-word role.
   */
  const openRole = (row: SystemUserRecord) => {
    setNextRole(row.roles[0] ?? "");
    setRoleOf(row);
  };

  /** Which branch these rows belong to. Null is the whole company. */
  const scope = user?.activeBranch;

  const actionsFor = (u: SystemUserRecord) => [
    ...(can.update ? [{ label: "Change role", onSelect: () => openRole(u) }] : []),
    ...(can.create
      ? [
          {
            label: "Resend invite",
            onSelect: () => act(() => RoleService.resendInvite(u.id), `Invitation sent to ${u.mail}.`),
          },
        ]
      : []),
    ...(can.remove && u.status === "Active"
      ? [{ label: "Deactivate", onSelect: () => setDropOf(u) }]
      : []),
  ];

  if (!sessionLoading && !can.view) {
    return (
      <div className="w-full rounded-[12px] bg-white p-[24px] shadow-[inset_0_0_0_1px_#eaeaea]">
        <h1 className="text-[18px] font-medium text-[#1e1e1e]">Users</h1>
        <p className="mt-[6px] text-[14px] leading-[1.6] text-[#525252]">
          Your role does not include <span className="font-medium">user.view</span>, so this
          company&apos;s staff list is not yours to read. An administrator can grant it under
          Roles.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Two things live on this screen and they are different kinds of thing:
          the people, and the jobs those people hold. */}
      {can.viewRoles && (
        <div className="flex w-fit items-center gap-[2px] rounded-[10px] bg-white p-[3px] shadow-[inset_0_0_0_1px_#eaeaea]">
          {(["users", "roles"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t}
              className={`cursor-pointer rounded-[8px] px-[16px] py-[8px] text-[14px] font-medium capitalize transition-colors ${
                tab === t ? "bg-[#fdf7e6] text-[#1e1e1e]" : "text-[#525252] hover:bg-[#fafafa]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {tab === "roles" ? (
        <RolesPanel
          roles={roleRecords}
          loading={rolesLoading}
          note={note}
          can={can}
          onNew={() => setEditing(null)}
          onEdit={(r) => setEditing(r)}
          onDelete={async (r) => {
            try {
              await RoleService.deleteRole(r.id);
              setNote(`${r.name} deleted.`);
              setRolesKey((k) => k + 1);
            } catch (e) {
              setNote(RoleService.describeError(e));
            }
          }}
        />
      ) : (
      <>
      {/* Headline — 59:18136 */}
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:items-center lg:justify-between lg:gap-0">
        <div className="flex h-[44px] w-full items-center justify-between gap-[12px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:w-[370px]">
          <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, phone or role..."
              aria-label="Search users"
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
            />
          </div>
          <button
            type="button"
            aria-label="Filter"
            onClick={() => setFilterOpen((v) => !v)}
            className="shrink-0 cursor-pointer text-[#525252] transition-colors hover:text-[#1e1e1e]"
          >
            <FilterIcon />
          </button>
        </div>

        <div className="flex flex-col items-stretch gap-[12px] sm:flex-row sm:items-center sm:gap-[16px]">
          <div ref={filterRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
              className="flex h-[48px] w-full cursor-pointer items-center justify-between gap-[12px] rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[12px] text-[16px] leading-[24px] font-medium whitespace-nowrap text-[#525252] transition-colors hover:bg-[#fafafa] sm:w-auto"
            >
              {filter}
              <CaretIcon open={filterOpen} />
            </button>

            {filterOpen && (
              <ul
                role="listbox"
                className="absolute right-0 z-30 mt-[6px] w-[168px] overflow-hidden rounded-[10px] border border-[#eaeaea] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
              >
                {FILTERS.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={f === filter}
                      onClick={() => {
                        setFilter(f);
                        setPage(1);
                        setFilterOpen(false);
                      }}
                      className={`w-full cursor-pointer px-[14px] py-[9px] text-left text-[14px] transition-colors hover:bg-[#fdf7e6] ${
                        f === filter ? "bg-[#fdf7e6] font-medium text-[#1e1e1e]" : "text-[#525252]"
                      }`}
                    >
                      {f}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {can.create && (
            <Link
              href="/roles-permissions/add"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
            >
              <AddIcon />
              Add New
            </Link>
          )}
        </div>
      </div>

      {/* Which branch these people belong to. Without it, a correctly narrowed
          list looks like data that has gone missing. */}
      <p className="text-[13px] leading-[1.5] text-[#525252]">
        {scope ? (
          <>
            Showing the staff of{" "}
            <span className="font-medium text-[#1e1e1e]">
              {scope.code}
              {scope.name ? ` · ${scope.name}` : ""}
            </span>
            , plus company-wide accounts. Use the branch picker in the top bar to see another.
          </>
        ) : (
          <>Showing every branch. Pick one in the top bar to narrow this list.</>
        )}
      </p>

      {/* Table card — 59:18163 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        {loadError && (
          <p role="alert" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#ffdfe2] px-[12px] py-[8px] text-[13px] text-[#a02620]">
            {loadError}
          </p>
        )}
        {note && (
          <p role="status" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1050px]">
              <div className={`grid ${GRID} items-start overflow-clip`}>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>#</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>User Name</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Phone</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Mail</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Role</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Last Login</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Action</span></div>

                {/* One indicator, not two: the skeleton was rendered under a
                    "Loading users..." line on every first load. */}
                {loading && <TableSkeleton columns={GRID} rows={pageSize} />}

                {!loading && rows.length === 0 && (
                  <div className="col-span-8 px-[12px] py-[28px] text-center text-[14px] text-[#525252]">
                    {scope
                      ? "Nobody matches this view in this branch."
                      : "No users match this view."}
                  </div>
                )}

                {!loading &&
                  rows.map((u) => (
                    <React.Fragment key={u.id}>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{u.index}</span>
                      </div>
                      <div className={`${CELL} h-[54px] gap-[8px] border-b border-solid border-[#eaeaea]`}>
                        <Avatar radius={4} name={u.name} />
                        <span className={`${BODY} truncate`}>{u.name}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={`${BODY} truncate`}>{u.phone}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={`${BODY} truncate`}>{u.mail}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={`${BODY} truncate`}>{u.role}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{u.lastLogin}</span>
                      </div>
                      <div className={`${CELL} h-[54px] justify-center border-b border-solid border-[#eaeaea]`}>
                        <StatusPill label={u.status} tone={STATUS_TONE[u.status]} />
                      </div>
                      <div className={`${CELL} h-[54px] justify-center border-b border-solid border-[#eaeaea]`}>
                        {actionsFor(u).length > 0 && (
                          <RowActionMenu label={`Actions for ${u.name}`} actions={actionsFor(u)} />
                        )}
                      </div>
                    </React.Fragment>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Below md the grid cannot hold eight columns; each row becomes a card. */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {loading && (
            <p className="py-[20px] text-center text-[14px] text-[#525252]">Loading users...</p>
          )}
          {!loading &&
            rows.map((u) => (
              <div key={u.id} className="rounded-[10px] p-[12px] shadow-[inset_0_0_0_1px_#eaeaea]">
                <div className="flex items-start justify-between gap-[10px]">
                  <div className="flex min-w-0 items-center gap-[8px]">
                    <Avatar radius={4} name={u.name} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1e1e1e]">{u.name}</p>
                      <p className="truncate text-[13px] text-[#525252]">{u.mail}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-[8px]">
                    <StatusPill label={u.status} tone={STATUS_TONE[u.status]} />
                    {actionsFor(u).length > 0 && (
                      <RowActionMenu label={`Actions for ${u.name}`} actions={actionsFor(u)} />
                    )}
                  </div>
                </div>
                <div className="mt-[8px] grid grid-cols-2 gap-x-[12px] gap-y-[4px] text-[13px] text-[#525252]">
                  <span className="truncate">{u.phone}</span>
                  <span className="truncate text-right">{u.role}</span>
                  <span className="col-span-2">Last login {u.lastLogin}</span>
                </div>
              </div>
            ))}
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>
      </>
      )}

      {/* `undefined` means closed; `null` means "new role". */}
      {editing !== undefined && (
        <RoleEditor
          role={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(message) => {
            setEditing(undefined);
            setNote(message);
            setRolesKey((k) => k + 1);
            // A role's codes or branches changing can change what THIS person
            // may do, so the roles the user dialog offers are refetched too.
            RoleService.getRoles().then(setRoles).catch(() => undefined);
          }}
        />
      )}

      {/* Change role */}
      <Modal
        open={roleOf !== null}
        onClose={() => setRoleOf(null)}
        title="Change role"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setRoleOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !nextRole}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                roleOf &&
                act(
                  () => RoleService.setRoles(roleOf.id, [nextRole]),
                  `${roleOf.name} is now ${nextRole}.`
                )
              }
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px]">
          <div className="flex items-center gap-[12px]">
            <Avatar radius={4} name={roleOf?.name ?? ""} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[#1e1e1e]">{roleOf?.name}</p>
              <p className="truncate text-[13px] text-[#525252]">{roleOf?.mail}</p>
            </div>
          </div>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Role</span>
            <select value={nextRole} onChange={(e) => setNextRole(e.target.value)} className={FIELD}>
              <option value="">Select a role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          {/* The API replaces the whole set, so somebody holding two roles
              keeps only what is chosen here. Saying so beats finding out. */}
          {roleOf && roleOf.roles.length > 1 && (
            <p className="rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] leading-[1.5] text-[#6d5b46]">
              {roleOf.name} currently holds {roleOf.roles.join(", ")}. Saving replaces all of them
              with the one chosen above.
            </p>
          )}

          <p className="text-[13px] leading-[1.5] text-[#525252]">
            This is a company-wide role. A job held in one branch only is a branch role, granted
            per branch.
          </p>
        </div>
      </Modal>

      {/* Deactivate */}
      <Modal
        open={dropOf !== null}
        onClose={() => setDropOf(null)}
        title="Deactivate user"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setDropOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              style={{ backgroundImage: RED_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                dropOf && act(() => RoleService.deactivate(dropOf.id), `${dropOf.name} deactivated.`)
              }
            >
              {saving ? "Working..." : "Deactivate"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          <span className="font-medium text-[#1e1e1e]">{dropOf?.name}</span> will not be able to
          sign in and stops using a plan seat. Their history is kept.
        </p>
      </Modal>
    </div>
  );
}

/**
 * The roles this company defines, and what each one carries.
 *
 * Two columns matter and neither was visible anywhere before: how many
 * permission codes a role grants, and which branches it lets its holders read.
 * The second is the one worth showing on a list — a role quietly carrying
 * "sees every branch" is the difference between a shop manager and somebody
 * who can read the whole company, and until it is on screen nobody audits it.
 */
function RolesPanel({
  roles,
  loading,
  note,
  can,
  onNew,
  onEdit,
  onDelete,
}: {
  roles: RoleRecord[];
  loading: boolean;
  note: string | null;
  can: { createRole: boolean; updateRole: boolean; deleteRole: boolean };
  onNew: () => void;
  onEdit: (role: RoleRecord) => void;
  onDelete: (role: RoleRecord) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <p className="text-[13px] leading-[1.5] text-[#525252]">
          A role is a job: what its holders can do, and whose data they can see.
        </p>
        {can.createRole && (
          <button
            type="button"
            onClick={onNew}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            New role
          </button>
        )}
      </div>

      <div className="w-full overflow-hidden rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
        {note && (
          <p role="status" className="mb-[12px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        {loading && <p className="py-[24px] text-center text-[14px] text-[#525252]">Loading roles...</p>}

        {!loading && roles.length === 0 && (
          <p className="py-[24px] text-center text-[14px] text-[#525252]">No roles defined yet.</p>
        )}

        <ul className="flex flex-col gap-[10px]">
          {!loading &&
            roles.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-[12px] rounded-[10px] p-[12px] shadow-[inset_0_0_0_1px_#eaeaea]"
              >
                <div className="min-w-[180px] flex-1">
                  <p className="flex items-center gap-[8px] text-[14px] font-medium text-[#1e1e1e]">
                    {r.name}
                    {r.isSystem && (
                      <span className="rounded-[5px] bg-[#f0f0f0] px-[7px] py-[2px] text-[11px] font-medium text-[#525252]">
                        Built-in
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[13px] text-[#525252]">
                    {r.description || "No description"}
                  </p>
                </div>

                <p className="shrink-0 text-[13px] text-[#525252]">
                  {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
                </p>

                <p
                  className={`shrink-0 rounded-[6px] px-[8px] py-[3px] text-[13px] ${
                    r.branches.length > 0
                      ? "bg-[#fdf7e6] font-medium text-[#6d5b46]"
                      : "text-[#8a8a8a]"
                  }`}
                >
                  {r.branches.length > 0
                    ? `Sees ${r.branches.length} extra branch${r.branches.length === 1 ? "" : "es"}`
                    : "Own branch only"}
                </p>

                <div className="flex shrink-0 items-center gap-[8px]">
                  {can.updateRole && (
                    <button
                      type="button"
                      onClick={() => onEdit(r)}
                      className="h-[36px] cursor-pointer rounded-[8px] px-[12px] text-[13px] font-medium text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa]"
                    >
                      Edit
                    </button>
                  )}
                  {can.deleteRole && !r.isSystem && (
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      className="h-[36px] cursor-pointer rounded-[8px] px-[12px] text-[13px] font-medium text-[#a02620] shadow-[inset_0_0_0_1px_#f4d4d4] transition-colors hover:bg-[#fff5f5]"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
