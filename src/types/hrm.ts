export interface EmployeeRecord {
  id: string;
  index: string;
  name: string;
  avatar: string;
  department: "Management" | "HR" | "Sales" | "Accounts" | "IT";
  designation: string;
  checkIn: string;
  checkOut: string;
  status: "Present" | "On Leave" | "Absent";
}

export interface HrmQueryFilter {
  /** Which day's attendance to show against each employee. Defaults to today. */
  day?: string;
  search?: string;
  department?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface CreateEmployeePayload {
  name: string;
  department: "Management" | "HR" | "Sales" | "Accounts" | "IT";
  designation: string;
  status?: "Present" | "On Leave" | "Absent";
}

/**
 * Somebody who works here — the roster, with no attendance in it.
 *
 * `EmployeeRecord` above is a DAY's attendance wearing an employee's name:
 * its `status` is Present / On Leave / Absent, which is a fact about one date
 * rather than about the person. The two were one type behind one screen, so
 * "who works here" could not be answered without picking a day first.
 */
export interface EmployeeProfile {
  id: string;
  index: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  branch: string;
  /** ISO date, formatted at the point of use. */
  joinedOn: string;
  isActive: boolean;
}
