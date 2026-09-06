import { SystemUserRecord } from "@/types/roles";

/**
 * A user from the API -> a row in the user list.
 *
 * Roles come back as names and a person can hold several, but the table has
 * one column: it shows the first and counts the rest.
 */

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** "2026-09-04T10:12:00Z" -> "04 Sep 2026". Never signed in shows "—". */
export function toLastLogin(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "—" : WHEN.format(at);
}

export function toSystemUser(row: any, index: number): SystemUserRecord {
  const roles: string[] = Array.isArray(row?.roles) ? row.roles.map(String) : [];
  return {
    id: String(row?.id ?? ""),
    index: String(index).padStart(2, "0"),
    name: String(row?.fullName || row?.email || "—"),
    // The API carries no profile photo; the table shows initials.
    avatar: "",
    phone: String(row?.phone || "—"),
    mail: String(row?.email || "—"),
    role: roles.length > 1 ? `${roles[0]} +${roles.length - 1}` : roles[0] || "—",
    // The names themselves, beside the label. The label is lossy on purpose
    // and cannot be turned back into them.
    roles,
    lastLogin: toLastLogin(row?.lastLogin),
    status: row?.isActive === false ? "Inactive" : "Active",
  };
}
