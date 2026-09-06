import { ReturnRecord, ReturnQueryFilter } from "@/types/returns";

export const initialReturnsData: ReturnRecord[] = [
  {
    id: "ret-1",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-2",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-3",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-4",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-5",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-6",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-7",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-8",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-9",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 15600,
    totalAmountFormatted: "৳ 15,600",
    refundAmount: 15600,
    refundAmountFormatted: "৳ 15,600",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-10",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 1999,
    totalAmountFormatted: "৳ 1,999",
    refundAmount: 1999,
    refundAmountFormatted: "৳ 1,999",
    paymentMethod: "bKash",
    status: "Paid",
  },
  {
    id: "ret-11",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 2750,
    totalAmountFormatted: "৳ 2,750",
    refundAmount: 2750,
    refundAmountFormatted: "৳ 2,750",
    paymentMethod: "Cash",
    status: "Paid",
  },
  {
    id: "ret-12",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 850,
    totalAmountFormatted: "৳ 850",
    refundAmount: 850,
    refundAmountFormatted: "৳ 850",
    paymentMethod: "Cash",
    status: "Unpaid",
  },
  {
    id: "ret-13",
    returnNo: "RET-2024-0032",
    invoiceNo: "INV-2024-00125",
    dateTime: "17 May 2026 - 10:45 AM",
    customerName: "Rahim Uddin",
    totalAmount: 5000,
    totalAmountFormatted: "৳ 5,000",
    refundAmount: 5000,
    refundAmountFormatted: "৳ 5,000",
    paymentMethod: "Cash",
    status: "Paid",
  },
];

export class ReturnsService {
  private static baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

  /**
   * Fetch returns list with optional filters
   */
  static async getReturns(params?: ReturnQueryFilter): Promise<{ data: ReturnRecord[]; total: number }> {
    let list = [...initialReturnsData];

    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (r) =>
          r.returnNo.toLowerCase().includes(q) ||
          r.invoiceNo.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q)
      );
    }

    if (params?.status) {
      list = list.filter((r) => r.status.toLowerCase() === params.status?.toLowerCase());
    }

    return Promise.resolve({
      data: list,
      total: 50,
    });
  }

}

