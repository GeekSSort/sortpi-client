import { CustomerRecord, CustomerQueryFilter, CreateCustomerPayload } from "@/types/customer";

export const initialCustomersData: CustomerRecord[] = [
  {
    id: "cus-1",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Regular",
    orderCount: 24,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Active",
  },
  {
    id: "cus-2",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "VIP",
    orderCount: 33,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Inactive",
  },
  {
    id: "cus-3",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Premium",
    orderCount: 15,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Active",
  },
  {
    id: "cus-4",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Regular",
    orderCount: 91,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Active",
  },
  {
    id: "cus-5",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "VIP",
    orderCount: 34,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Active",
  },
  {
    id: "cus-6",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Regular",
    orderCount: 14,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Inactive",
  },
  {
    id: "cus-7",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Premium",
    orderCount: 64,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Active",
  },
  {
    id: "cus-8",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "VIP",
    orderCount: 13,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Active",
  },
  {
    id: "cus-9",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Premium",
    orderCount: 25,
    totalSpent: 15600,
    totalSpentFormatted: "৳ 15,600",
    dueAmount: 15600,
    dueAmountFormatted: "৳ 15,600",
    status: "Active",
  },
  {
    id: "cus-10",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "VIP",
    orderCount: 74,
    totalSpent: 1999,
    totalSpentFormatted: "৳ 1,999",
    dueAmount: 1999,
    dueAmountFormatted: "৳ 1,999",
    status: "Active",
  },
  {
    id: "cus-11",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Regular",
    orderCount: 34,
    totalSpent: 2750,
    totalSpentFormatted: "৳ 2,750",
    dueAmount: 2750,
    dueAmountFormatted: "৳ 2,750",
    status: "Active",
  },
  {
    id: "cus-12",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Premium",
    orderCount: 39,
    totalSpent: 850,
    totalSpentFormatted: "৳ 850",
    dueAmount: 850,
    dueAmountFormatted: "৳ 850",
    status: "Inactive",
  },
  {
    id: "cus-13",
    customerId: "CUS-001245",
    name: "Rahim Uddin",
    phone: "+880 1712-456 890",
    email: "info@abctraders.com",
    type: "Regular",
    orderCount: 40,
    totalSpent: 5000,
    totalSpentFormatted: "৳ 5,000",
    dueAmount: 5000,
    dueAmountFormatted: "৳ 5,000",
    status: "Active",
  },
];

export class CustomerService {
  private static baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

  /**
   * Fetch customer list with search and filters
   */
  static async getCustomers(params?: CustomerQueryFilter): Promise<{ data: CustomerRecord[]; total: number }> {
    let list = [...initialCustomersData];

    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.customerId.toLowerCase().includes(q) ||
          c.phone.includes(q)
      );
    }

    if (params?.status) {
      list = list.filter((c) => c.status.toLowerCase() === params.status?.toLowerCase());
    }

    return Promise.resolve({
      data: list,
      total: 50,
    });
  }

  /**
   * Create a new customer in backend DB
   */
  static async createCustomer(payload: CreateCustomerPayload): Promise<CustomerRecord> {
    const newCustomer: CustomerRecord = {
      id: `cus-${Date.now()}`,
      customerId: `CUS-${Math.floor(100000 + Math.random() * 900000)}`,
      name: payload.name,
      phone: payload.phone,
      type: payload.type,
      orderCount: 0,
      totalSpent: 0,
      totalSpentFormatted: "৳ 0",
      dueAmount: 0,
      dueAmountFormatted: "৳ 0",
      status: payload.status || "Active",
    };
    return Promise.resolve(newCustomer);
  }
}

