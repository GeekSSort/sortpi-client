export interface SystemUserRecord {
  id: string;
  index: string;
  name: string;
  avatar: string;
  phone: string;
  mail: string;
  /** What the Role column shows: the first role, and a count of the rest. */
  role: string;
  /**
   * Every role name the person holds.
   *
   * The label above cannot be parsed back into this — "Branch Manager +1"
   * splits on a space into "Branch", which matches no role — and the API
   * REPLACES the whole set on PATCH, so the change-role dialog needs the real
   * names or saving silently drops the roles it could not read.
   */
  roles: string[];
  lastLogin: string;
  status: "Active" | "Inactive";
}

export interface UserQueryFilter {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface CreateUserPayload {
  name: string;
  phone: string;
  mail: string;
  role: string;
  /** Which branch's staff list they join. Empty means the whole company. */
  branchId?: string;
  status?: "Active" | "Inactive";
}
