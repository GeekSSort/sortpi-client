import { EmployeeRecord, HrmQueryFilter } from "@/types/hrm";
import { initialEmployeesData } from "@/lib/services/hrm.service";
import { apiFetch, apiList, ApiError, PagedResult, tokenStore } from "./apiClient";
import { AttendanceToday, toEmployeeRecord } from "./mappers/employee";
import { BranchService } from "./branchService";

/**
 * Employees, and what they did today.
 *
 * Two endpoints: `/hrm/employees/` says who someone is, `/hrm/attendance/`
 * says whether they are in. The table shows them together.
 */

export interface Lookup {
  id: string;
  name: string;
}

export class HrmService {
  /**
   * The employees table, one page at a time.
   *
   * The search, the department filter and the page all go to the API now. This
   * used to load everyone at once and sift them in the browser — its own
   * comment called a server-side search "the real fix" — and because a page is
   * capped at 200, a search past that simply could not see the rest of the
   * staff.
   */
  static async getEmployees(params?: HrmQueryFilter): Promise<PagedResult<EmployeeRecord>> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 8;

    const today = new Date();
    const localDay =
      params?.day ??
      new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.department) query.set("department", params.department);
    // Present / On Leave / Absent is about a DAY, so the day goes with it.
    // This used to be sent as `status`, which the API read as the employee's
    // active flag — "Present" matched neither Active nor Inactive, so the
    // filter was silently dropped and every employee came back.
    if (params?.status) {
      query.set("attendance_status", params.status);
      query.set("day", localDay);
    }
    query.set("page", String(page));
    query.set("limit", String(limit));

    // One day only. This asked for every attendance record ever written and
    // matched them by employee, so whichever row came back first decided what
    // the table said someone was doing today. Which day is the caller's
    // business — the screen has a date picker that was setting a value nothing
    // read.

    const [employees, attendance] = await Promise.all([
      apiList<any>(
        `/hrm/employees/?${query.toString()}`,
        { method: "GET" },
        { data: initialEmployeesData as any[], total: initialEmployeesData.length },
        (r) => r
      ),
      apiList<any>(
        `/hrm/attendance/?date_from=${localDay}&date_to=${localDay}&limit=200`,
        { method: "GET" },
        { data: [], total: 0 },
        (r) => r
      ).catch(() => ({ data: [] as any[] })),
    ]);

    // Sample rows are already in the right shape, so there is nothing to join.
    if (employees.data[0]?.status) {
      const rows = employees.data as EmployeeRecord[];
      return {
        data: rows.slice((page - 1) * limit, page * limit),
        total: rows.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(rows.length / limit)),
      };
    }

    // First wins, and the API returns newest first. This used to `set`
    // unconditionally, so every older row overwrote the newer one and the
    // OLDEST attendance record decided what the table showed — a check-in
    // saved a minute ago lost to one from last week.
    const byEmployee = new Map<string, AttendanceToday>();
    for (const a of attendance.data || []) {
      const key = String(a?.employee ?? "");
      if (key && !byEmployee.has(key)) {
        byEmployee.set(key, { status: a?.status, checkIn: a?.checkIn, checkOut: a?.checkOut });
      }
    }

    const offset = (page - 1) * limit;
    return {
      data: employees.data.map((row: any, i: number) =>
        toEmployeeRecord(row, offset + i + 1, byEmployee.get(String(row?.id)))
      ),
      total: employees.total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(employees.total / limit)),
    };
  }

  /** Departments and designations, for the Add Employee form. */
  static async getLookups(): Promise<{ departments: Lookup[]; designations: Lookup[] }> {
    const [departments, designations] = await Promise.all([
      apiList<Lookup>("/hrm/departments/?limit=100", { method: "GET" }, { data: [], total: 0 }, (r: any) => ({
        id: String(r?.id ?? ""),
        name: String(r?.name ?? ""),
      })),
      apiList<Lookup>("/hrm/designations/?limit=100", { method: "GET" }, { data: [], total: 0 }, (r: any) => ({
        id: String(r?.id ?? ""),
        name: String(r?.name ?? ""),
      })),
    ]);
    return { departments: departments.data, designations: designations.data };
  }

  /**
   * Create an employee.
   *
   * The form takes a full name and typed department and job title; the API
   * wants first and last name and ids. The swap happens here, and a name that
   * does not exist yet is created.
   */
  static async createEmployee(payload: {
    name: string;
    email: string;
    phone?: string;
    department: string;
    designation: string;
  }): Promise<EmployeeRecord> {
    const [first, ...rest] = payload.name.trim().split(/\s+/);
    const { departments, designations } = await HrmService.getLookups();

    const departmentId =
      findByName(departments, payload.department) ??
      (await createLookup("/hrm/departments/", { name: payload.department }));

    const designationId =
      findByName(designations, payload.designation) ??
      (await createLookup("/hrm/designations/", {
        name: payload.designation,
        department: departmentId,
      }));

    // The branch this person works in, and it is not decorative: the employee
    // list is branch-scoped, so this decides whose staff list they appear on.
    // The branch the administrator is STANDING in, not `branches[0]` — that
    // was whichever branch sorted first, so adding somebody while working in
    // Chattogram filed them in Dhaka and they vanished from the page that
    // created them.
    const branches = await BranchService.list();
    const branchId = tokenStore.branch() || branches[0]?.id;

    const row = await apiFetch<any>("/hrm/employees/", {
      method: "POST",
      body: JSON.stringify({
        first_name: first,
        // The API needs a last name, so a one-word name repeats itself rather
        // than failing in front of the person typing.
        last_name: rest.join(" ") || first,
        email: payload.email,
        phone: payload.phone || "",
        // `_id`, all three. The write shape is EmployeeCreateSerializer, whose
        // fields are `branch_id`, `department_id` and `designation_id` — sent
        // without the suffix they are three missing required fields, and every
        // Add Employee ended in a 400 naming columns the form does not show.
        branch_id: branchId,
        department_id: departmentId,
        designation_id: designationId,
        date_of_joining: new Date().toISOString().slice(0, 10),
      }),
    });
    return toEmployeeRecord(row, 1);
  }

  /**
   * Mark somebody in or out for today.
   *
   * `time` is "HH:MM" from the dialog. Without it the server uses now.
   */
  static async clock(employeeId: string, direction: "in" | "out", time?: string): Promise<void> {
    const field = direction === "in" ? "check_in" : "check_out";
    // The shop's date, not UTC. `toISOString()` is UTC, so in Dhaka (+6)
    // anything clocked before 06:00 was written against YESTERDAY and then
    // never appeared on today's row.
    const now = new Date();
    const localDay = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    await apiFetch(`/hrm/attendance/check-${direction}/`, {
      method: "POST",
      body: JSON.stringify({
        employee_id: employeeId,
        date: localDay,
        ...(time ? { [field]: `${time}:00` } : {}),
      }),
    });
  }

  static async deactivate(employeeId: string): Promise<void> {
    await apiFetch(`/hrm/employees/${employeeId}/deactivate/`, { method: "POST", body: "{}" });
  }

  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "PLAN_LIMIT_REACHED") return error.message;
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      const field = Object.values(error.errors || {})[0];
      if (Array.isArray(field) && field.length) return String(field[0]);
      return error.message;
    }
    return "Something went wrong. Please try again.";
  }
}

function findByName(rows: Lookup[], name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return rows.find((r) => r.name.trim().toLowerCase() === wanted)?.id;
}

async function createLookup(path: string, body: Record<string, unknown>): Promise<string> {
  const row = await apiFetch<any>(path, { method: "POST", body: JSON.stringify(body) });
  return String(row?.id ?? "");
}
