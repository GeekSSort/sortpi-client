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
  /**
   * The branches this person may sign in to, by id.
   *
   * An EMPTY list is not "nowhere" — the server reads it as head office, which
   * reaches every branch. `branchLabel` carries the sentence a reader needs;
   * these are the ids the change-branch flow would need.
   */
  branchIds: string[];
  /** "Dhaka Branch, Chattogram Branch", or "All branches" for head office. */
  branchLabel: string;
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
