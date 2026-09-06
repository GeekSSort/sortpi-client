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

