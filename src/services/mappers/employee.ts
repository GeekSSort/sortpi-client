import { EmployeeRecord } from "@/types/hrm";

/**
 * Employee plus today's attendance -> a row in the employees table.
 *
 * The server keeps the two apart: one says who somebody is, the other says
 * whether they came in. The caller fetches both and matches them by id.
 */

const STATUS: Record<string, EmployeeRecord["status"]> = {
  PRESENT: "Present",
  LEAVE: "On Leave",
  HALF_DAY: "Present",
  ABSENT: "Absent",
};

/** "09:02:00" -> "09:02 AM". Somebody absent has no time at all. */
export function toClockTime(value: unknown): string {
  if (typeof value !== "string" || !value.includes(":")) return "—";
  const [h, m] = value.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour)) return "—";
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelve).padStart(2, "0")}:${m} ${suffix}`;
}

/** "09:11 AM" -> "09:11", for a time input. Blank when nothing is set. */
export function toTimeInput(display: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(display.trim());
  if (!m) return "";
  const base = Number(m[1]) % 12;
  const hour = m[3].toUpperCase() === "PM" ? base + 12 : base;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

export interface AttendanceToday {
  status?: string;
  checkIn?: string | null;
  checkOut?: string | null;
}

export function toEmployeeRecord(
  row: any,
  index: number,
  attendance?: AttendanceToday
): EmployeeRecord {
  const name = [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim();
  return {
    id: String(row?.id ?? ""),
    index: String(index).padStart(2, "0"),
    name: name || String(row?.email ?? ""),
    // The server has no employee photo. The table shows initials instead.
    avatar: "",
    department: (row?.departmentName || "—") as EmployeeRecord["department"],
    designation: String(row?.designationName || "—"),
    checkIn: toClockTime(attendance?.checkIn),
    checkOut: toClockTime(attendance?.checkOut),
    // No attendance row yet means nobody has marked them today.
    status: STATUS[String(attendance?.status || "").toUpperCase()] ?? "Absent",
  };
}
