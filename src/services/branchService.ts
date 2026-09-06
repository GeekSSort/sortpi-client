import { Branch, CreateBranchPayload } from "@/types/branch";
import { apiFetch, apiList, tokenStore, ApiError } from "./apiClient";
import { clearCache } from "@/lib/query/store";

function toBranch(row: any): Branch {
  return {
    id: String(row?.id ?? ""),
    code: String(row?.code ?? ""),
    name: String(row?.name ?? ""),
    phone: row?.phone || undefined,
    email: row?.email || undefined,
    address: row?.address || undefined,
    isActive: row?.isActive !== false,
  };
}

export class BranchService {
  /**
   * The branches this user can act in — scoped by the server. No assignment
   * means head office and the whole company; an active branch narrows further.
   */
  static async list(): Promise<Branch[]> {
    const res = await apiList<Branch>(
      "/branches/",
      { method: "GET" },
      toBranch
    );
    return res.data;
  }

  /**
   * Create a branch. The server builds its MAIN and TRANSIT warehouses in the
   * same transaction. PLAN_LIMIT_REACHED carries `limit`, `current` and `plan`.
   */
  static async create(payload: CreateBranchPayload): Promise<Branch> {
    const row = await apiFetch<any>("/branches/", {
      method: "POST",
      body: JSON.stringify({
        code: payload.code.trim().toUpperCase(),
        name: payload.name.trim(),
        phone: payload.phone?.trim() || "",
        email: payload.email?.trim() || "",
        address: payload.address?.trim() || "",
      }),
    });
    return toBranch(row);
  }

  /**
   * Stand in a branch, or in none for the whole company. The server returns a
   * fresh token pair carrying that branch's permissions, so the new token must
   * be taken or the client believes it can do things the server will refuse.
   */
  static async setActive(branchId: string | null): Promise<void> {
    const res = await apiFetch<{ access?: string; refresh?: string }>("/auth/active-branch", {
      method: "POST",
      body: JSON.stringify({ branch: branchId }),
    });

    if (res?.access) tokenStore.set(res.access, res.refresh);
    tokenStore.setBranch(branchId);

    // Every list in the cache was answered for the PREVIOUS branch. Keeping
    // them would show Dhaka's stock under Chattogram's name for as long as the
    // entries stayed fresh, which is the exact confusion branch scoping exists
    // to prevent.
    clearCache();
  }

  /** Human text for the errors this screen can actually provoke. */
  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "PLAN_LIMIT_REACHED") {
        const e = error.errors as { limit?: number; plan?: string };
        return e?.limit
          ? `Your ${e.plan ?? "current"} plan allows ${e.limit} branches. Upgrade to add another.`
          : error.message;
      }
      // 409 names the constraint that failed; only one is reachable here.
      if (error.code === "DUPLICATE_RESOURCE") {
        return "That branch code is already used. Pick a different one.";
      }
      if (error.code === "NETWORK_ERROR") return "Could not reach the server. Check it is running.";
      if (error.status === 403) return "You do not have permission to add a branch.";
      const field = Object.values(error.errors || {})[0];
      if (Array.isArray(field) && field.length) return String(field[0]);
      return error.message;
    }
    return "Something went wrong. Please try again.";
  }
}
