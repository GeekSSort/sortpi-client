import { SystemUserRecord, UserQueryFilter, CreateUserPayload } from "@/types/roles";
import { PermissionRecord, RoleRecord, RolePayload } from "@/types/permissions";
import { apiFetch, apiList, ApiError, PagedResult, tokenStore } from "./apiClient";
import { toSystemUser } from "./mappers/user";

/**
 * System users and the roles they hold.
 *
 * Every read here is scoped by the server on two axes: the caller's own
 * organization, and the branch they are standing in. This screen must never
 * try to widen either one — no "show all branches" switch, no client-side
 * merge of several branches' lists. What the server sends IS the list.
 *
 * Searching, filtering and paging are the server's job too. They used to be
 * done in the browser over `?limit=500`, which the API clamps to 200: a
 * company with more than 200 users searched the first 200 by email, missed
 * everybody after that, and reported the truncated count as the total.
 */

export interface RoleOption {
  id: string;
  name: string;
  description?: string;
}

function query(params?: UserQueryFilter): string {
  const search = new URLSearchParams();
  search.set("page", String(params?.page ?? 1));
  search.set("limit", String(params?.limit ?? 8));
  if (params?.search?.trim()) search.set("search", params.search.trim());
  if (params?.role?.trim()) search.set("role", params.role.trim());
  // "Active" / "Inactive" is this screen's word for one boolean column.
  if (params?.status === "Active") search.set("is_active", "true");
  if (params?.status === "Inactive") search.set("is_active", "false");
  return search.toString();
}

export class RoleService {
  static async getUsers(params?: UserQueryFilter): Promise<PagedResult<SystemUserRecord>> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 8;
    const res = await apiList<any>(
      `/users/?${query(params)}`,
      { method: "GET" },
      { data: [], total: 0 },
      (row) => row
    );

    // The row number continues across pages, so page 2 starts at 09 rather
    // than at 01 again.
    const offset = (page - 1) * limit;
    return {
      ...res,
      data: res.data.map((row: any, i: number) => toSystemUser(row, offset + i + 1)),
    };
  }

  /** The roles this organization can assign. */
  static async getRoles(): Promise<RoleOption[]> {
    const roles = await apiList<RoleOption>(
      "/roles/?limit=100",
      { method: "GET" },
      { data: [], total: 0 },
      (r: any) => ({
        id: String(r?.id ?? ""),
        name: String(r?.name ?? ""),
        description: r?.description ? String(r.description) : undefined,
      })
    );
    return roles.data;
  }

  /** Roles with everything the editor needs: codes and branch visibility. */
  static async getRoleRecords(): Promise<RoleRecord[]> {
    const roles = await apiList<RoleRecord>(
      "/roles/?limit=200",
      { method: "GET" },
      { data: [], total: 0 },
      toRoleRecord
    );
    return roles.data;
  }

  /**
   * The permission catalogue the server enforces.
   *
   * Fetched, never hardcoded: a copy in the client drifts, and a role screen
   * that has silently stopped offering a code looks exactly like one where the
   * code was withheld on purpose. 200 covers the whole catalogue in one page.
   */
  static async getPermissions(): Promise<PermissionRecord[]> {
    const rows = await apiList<PermissionRecord>(
      "/permissions/?limit=200",
      { method: "GET" },
      { data: [], total: 0 },
      (p: any) => ({
        id: String(p?.id ?? ""),
        module: String(p?.module ?? ""),
        code: String(p?.code ?? ""),
        description: String(p?.description ?? ""),
      })
    );
    return rows.data;
  }

  static async createRole(payload: RolePayload): Promise<RoleRecord> {
    return toRoleRecord(
      await apiFetch<any>("/roles/", { method: "POST", body: JSON.stringify(payload) })
    );
  }

  /** `permissions` and `branches` are both replaced wholesale, not added to. */
  static async updateRole(id: string, payload: Partial<RolePayload>): Promise<RoleRecord> {
    return toRoleRecord(
      await apiFetch<any>(`/roles/${id}/`, { method: "PATCH", body: JSON.stringify(payload) })
    );
  }

  static async deleteRole(id: string): Promise<void> {
    await apiFetch(`/roles/${id}/`, { method: "DELETE" });
  }

  /**
   * Create a user, then mail them a link to set their own password.
   *
   * The API requires a password on create, and the form has no field for one —
   * rightly, since an administrator should never know it. A throwaway is sent
   * and immediately superseded by the invitation.
   *
   * `branches` decides which branch's staff list the person appears in. Left
   * empty they are org-wide and appear in every one, so the form asks; when it
   * does not, the server places them in the caller's active branch.
   */
  static async createUser(payload: CreateUserPayload): Promise<SystemUserRecord> {
    const branch = payload.branchId || tokenStore.branch();
    const created = await apiFetch<any>("/users/", {
      method: "POST",
      body: JSON.stringify({
        email: payload.mail,
        full_name: payload.name,
        phone: payload.phone,
        password: throwawayPassword(),
        roles: payload.role ? [payload.role] : [],
        is_active: payload.status !== "Inactive",
        ...(branch ? { branches: [branch] } : {}),
      }),
    });

    // A user who cannot be reached still exists; the list should show them.
    await apiFetch(`/users/${created?.id}/invite/`, { method: "POST", body: "{}" }).catch(
      () => undefined
    );
    return toSystemUser(created, 1);
  }

  /** Deactivating keeps the person's history; the API never deletes the row. */
  static async deactivate(id: string): Promise<void> {
    await apiFetch(`/users/${id}/`, { method: "DELETE" });
  }

  /**
   * Replace this user's org-wide roles.
   *
   * `roles` is a set, not an addition — the API replaces what is there, which
   * is why the dialog is seeded with every role the person already holds
   * rather than with the first one.
   */
  static async setRoles(id: string, roles: string[]): Promise<void> {
    await apiFetch(`/users/${id}/`, { method: "PATCH", body: JSON.stringify({ roles }) });
  }

  static async resendInvite(id: string): Promise<void> {
    await apiFetch(`/users/${id}/invite/`, { method: "POST", body: "{}" });
  }

  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "PLAN_LIMIT_REACHED") return error.message;
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      if (error.code === "SYSTEM_ROLE_PROTECTED") {
        return "This is a built-in role and cannot be deleted. Its permissions can still be changed.";
      }
      if (error.code === "CROSS_ORGANIZATION") {
        return "That branch belongs to another company.";
      }
      // Scoping answers 404, never 403, so the caller cannot tell an absent
      // row from one in another branch. Say so plainly rather than showing
      // "Resource not found", which reads like the app is broken.
      if (error.status === 404) {
        return "That user is not in the branch you are viewing. Switch branch and try again.";
      }
      if (error.status === 403) return "You do not have permission to do that.";
      const field = Object.values(error.errors || {})[0];
      if (Array.isArray(field) && field.length) return String(field[0]);
      return error.message;
    }
    return "Something went wrong. Please try again.";
  }
}

function toRoleRecord(row: any): RoleRecord {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    description: String(row?.description ?? ""),
    isSystem: row?.isSystem === true,
    permissions: Array.isArray(row?.permissions) ? row.permissions.map(String) : [],
    branches: Array.isArray(row?.branches) ? row.branches.map(String) : [],
  };
}

/** Long, random, and never shown — the invitation replaces it. */
function throwawayPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `Sp1!${Array.from(bytes, (b) => b.toString(36)).join("")}`;
}
