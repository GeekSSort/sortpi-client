"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SystemUserRecord } from "@/types/roles";
import { RoleRecord } from "@/types/permissions";
import { RoleService, RoleOption } from "@/services/roleService";
import { useSession } from "@/services/useSession";
import RoleEditor from "@/components/modules/dashboard/RoleEditor";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import FilterDropdown from "@/components/shared/FilterDropdown";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { CardListState, EmptyState, ErrorState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import {
  ActionButton,
  ActionLink,
  PageToolbar,
  PlusIcon,
  SearchInput,
  TABLE_CARD,
} from "@/components/shared/Toolbar";

/**
 * User List — Figma 59:18134.
 *
 * Nine columns: # 44, User Name 160, Phone 110, Mail takes the slack, Role
 * 130, Branches 170, Last Login 120, Status 92, Action 60. Tightened from the
 * eight-column layout to make room for Branches without pushing Status off the
 * edge of the scroll container at a common laptop width. Rows 54 tall with 12px cells.
 *
 * Branches answers "where may this person sign in", which the screen could not
 * say at all before — a Branch Manager and a company Accountant looked
 * identical in every column. Below md
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

// fr units, not pixels — the same rule the Products and Stock tables follow.
// Eight fixed columns beside a single `1fr` meant every pixel a wide screen had
// to spare went to Mail alone: the gaps between the other columns stayed at
// their minimum while one column grew, which is the unevenness this fixes. The
// numbers are the design's own widths, so at the table's 1120px minimum the
// layout is unchanged and only the spare width is now shared.
const GRID = "grid-cols-[44fr_160fr_110fr_234fr_130fr_170fr_120fr_92fr_60fr]";
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

// Still the source of the state's type, though the options now live on
// the dropdown itself.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FILTERS = ["All Users", "Active", "Inactive"] as const;

/** Long enough that typing a name is one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 300;


function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M10 4.375v11.25M4.375 10h11.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function RolesPermissionsPage() {
  const { user, loading: sessionLoading } = useSession();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All Users");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  // Two different things, and merging them ate one of them: `note` is what an
  // action just did ("Rahim deactivated."), the query's `error` is why the
  // list on screen is empty. Sharing one state meant the refetch an action
  // triggers cleared the confirmation that action had just set.
  const [note, setNote] = useState<string | null>(null);
  /**
   * Handing the company to somebody else.
   *
   * The mirror of the console's own handover, and it exists for the same
   * reason: the server refuses to let the LAST active Admin step down, and a
   * refusal with no next step is worse than the outage it prevents. Adds an
   * owner and removes none, so an interrupted handover leaves two.
   */
  const [handOverOpen, setHandOverOpen] = useState(false);
  const [handOver, setHandOver] = useState({ email: "", fullName: "" });
  const [handingOver, setHandingOver] = useState(false);
  const [handOverError, setHandOverError] = useState<string | null>(null);

  const transferOwnership = async () => {
    setHandingOver(true);
    setHandOverError(null);
    try {
      await RoleService.transferOwnership(handOver.email.trim(), handOver.fullName.trim());
      setNote(
        `${handOver.email.trim()} is now an Admin. They have been emailed a link ` +
          "to set a password. You can change your own role once they have."
      );
      setHandOverOpen(false);
      setHandOver({ email: "", fullName: "" });
      invalidate("roles");
    } catch (e) {
      setHandOverError(RoleService.describeError(e));
    } finally {
      setHandingOver(false);
    }
  };
  const [roleOf, setRoleOf] = useState<SystemUserRecord | null>(null);
  const [nextRole, setNextRole] = useState("");
  const [dropOf, setDropOf] = useState<SystemUserRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [editing, setEditing] = useState<RoleRecord | null | undefined>(undefined);

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
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // `enabled` is what stops a request going out before the session says
  // whether this person may read the directory at all — the old effect had to
  // return early and then remember to clear its own loading flag.
  const usersQuery = useInfiniteRows(
    queryKey("roles", {
      part: "users",
      search,
      status: filter === "All Users" ? undefined : filter,
    }),
    (p, limit) =>
      RoleService.getUsers({
        search: search || undefined,
        status: filter === "All Users" ? undefined : filter,
        page: p,
        limit,
      }),
    { pageSize, enabled: !sessionLoading && can.view }
  );
  const rows: SystemUserRecord[] = usersQuery.rows;
  const total = usersQuery.total;
  const { loadingMore, hasMore, sentinelRef } = usersQuery;
  const loading = usersQuery.loading;
  // A failed read must not leave the previous branch's rows on screen, which
  // is why the banner is rendered from the query's own error rather than a
  // separate flag that could outlive it.
  const loadError = usersQuery.error ? RoleService.describeError(usersQuery.error) : null;

  // The role names the Change-role dialog offers.
  const roleOptionsQuery = useQuery(
    queryKey("roles", { part: "options" }),
    () => RoleService.getRoles(),
    { enabled: !sessionLoading && can.view }
  );
  const roles: RoleOption[] = roleOptionsQuery.data ?? [];

  const roleRecordsQuery = useQuery(
    queryKey("roles", { part: "records" }),
    () => RoleService.getRoleRecords(),
    { enabled: tab === "roles" && can.viewRoles }
  );
  const roleRecords: RoleRecord[] = roleRecordsQuery.data ?? [];


  const act = async (fn: () => Promise<void>, done: string) => {
    setSaving(true);
    try {
      await fn();
      setNote(done);
      setRoleOf(null);
      setDropOf(null);
      // Changing somebody's role or deactivating them changes the directory
      // and what the role list reports, so both go stale.
      invalidate("roles");
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
    <>
    <div className="flex w-full flex-col gap-[14px]">
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
          loading={roleRecordsQuery.loading}
          fetching={roleRecordsQuery.fetching}
          error={roleRecordsQuery.error}
          hasData={roleRecordsQuery.data !== undefined}
          onRetry={roleRecordsQuery.refetch}
          note={note}
          can={can}
          onNew={() => setEditing(null)}
          onEdit={(r) => setEditing(r)}
          onDelete={async (r) => {
            try {
              await RoleService.deleteRole(r.id);
              setNote(`${r.name} deleted.`);
              // Deleting a role changes the list AND what the user dialog can
              // offer, and both read the "roles" prefix.
              invalidate("roles");
            } catch (e) {
              setNote(RoleService.describeError(e));
            }
          }}
        />
      ) : (
      <>
      {/* Headline — 59:18136 */}
      <PageToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, email, phone or role..."
            label="Search users"
          />
        }
      >
        <FilterDropdown
          label="Status"
          value={filter === "All Users" ? "" : filter}
          onChange={(next) => setFilter((next || "All Users") as typeof filter)}
          options={[
            { value: "All Users", label: "All users" },
            { value: "Active", label: "Active" },
            { value: "Inactive", label: "Inactive" },
          ]}
        />

        {can.create && (
          <ActionButton onClick={() => setHandOverOpen(true)}>
            Hand over ownership
          </ActionButton>
        )}

        {can.create && (
          <ActionLink href="/roles-permissions/add" variant="primary">
            <PlusIcon />
            Add New
          </ActionLink>
        )}
      </PageToolbar>

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
      <div className={TABLE_CARD}>
        <RefreshBar active={usersQuery.fetching} />
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

        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className="min-w-[1120px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip bg-white`}>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>#</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>User Name</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Phone</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Mail</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Role</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Branches</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Last Login</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Action</span></div>

                {/* One indicator, not two: the skeleton was rendered under a
                    "Loading users..." line on every first load. */}
                <QueryBoundary
                  loading={loading}
                  error={usersQuery.error}
                  hasData={!usersQuery.loading && !usersQuery.error}
                  skeleton={
                    <div className="col-span-9">
                      <TableSkeleton columns={GRID} rows={8} />
                    </div>
                  }
                  errorMessage={loadError ?? "Users could not be loaded."}
                  onRetry={usersQuery.refetch}
                >
                {rows.length === 0 && (
                  <div className="col-span-9">
                    <EmptyState
                      message={
                        scope
                          ? "Nobody matches this view in this branch."
                          : "No users match this view."
                      }
                      compact
                    />
                  </div>
                )}

                {rows.map((u) => (
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
                        {/* `title` because the cell truncates: three branch
                            names do not fit in 190px, and the full answer is
                            what somebody opened this screen for. */}
                        <span
                          className={`${BODY} truncate ${
                            u.branchIds.length === 0 ? "!text-[#1e1e1e]" : ""
                          }`}
                          title={u.branchLabel}
                        >
                          {u.branchLabel}
                        </span>
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
                </QueryBoundary>
              </div>
            </div>
          </div>
        </div>

        {/* Below md the grid cannot hold nine columns; each row becomes a card. */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {/* Was a bare loading skeleton: a failed load and an empty list both
              fell through to nothing at all, on a screen where "no users" and
              "we could not fetch the users" mean very different things. */}
          <CardListState
            loading={loading}
            error={usersQuery.error}
            hasData={!usersQuery.loading && !usersQuery.error}
            isEmpty={rows.length === 0}
            errorMessage={loadError ?? "Users could not be loaded."}
            emptyMessage={scope ? "Nobody matches this view in this branch." : "No users match this view."}
            onRetry={usersQuery.refetch}
            rows={4}
          />
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
                  <span className="col-span-2 truncate" title={u.branchLabel}>
                    Branches: {u.branchLabel}
                  </span>
                  <span className="col-span-2">Last login {u.lastLogin}</span>
                </div>
              </div>
            ))}
        </div>

        <ScrollEnd
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          shown={rows.length}
          total={total}
          noun="users"
        />
        </div>
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
            // A role's codes or branches changing can change what THIS person
            // may do, so the role list, the names the user dialog offers and
            // the directory itself all go stale together.
            invalidate("roles");
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
              onClick={transferOwnership}
            >
              {handingOver ? "Sending..." : "Make them an Admin"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] leading-[1.6] text-[#525252]">
            They become an Admin straight away, and are emailed a link to choose
            their own password if the account is new. Nothing is taken away from
            you — change your own role afterwards.
          </p>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Their email</span>
            <input
              type="email"
              value={handOver.email}
              onChange={(e) => setHandOver({ ...handOver, email: e.target.value })}
              className={FIELD}
              placeholder="successor@yourshop.com"
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
            A company always has at least one Admin. Until somebody else holds
            it, the last one cannot change their own role or be deactivated —
            nobody left could add a user or grant a role again.
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
    </>
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
  fetching,
  error,
  hasData,
  onRetry,
  note,
  can,
  onNew,
  onEdit,
  onDelete,
}: {
  roles: RoleRecord[];
  loading: boolean;
  fetching: boolean;
  error: unknown;
  hasData: boolean;
  onRetry: () => void;
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

      <div className="relative w-full overflow-hidden rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
        <RefreshBar active={fetching} />
        {note && (
          <p role="status" className="mb-[12px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        {loading && !hasData && <ListSkeleton rows={4} />}

        {error !== undefined && !hasData && (
          <ErrorState message="Roles could not be loaded." onRetry={onRetry} compact />
        )}

        {hasData && roles.length === 0 && (
          <EmptyState message="No roles defined yet." compact />
        )}

        <ul className="flex flex-col gap-[10px]">
          {hasData &&
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
