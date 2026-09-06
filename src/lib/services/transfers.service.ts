import { TransferRecord, TransferQueryFilter } from "@/types/transfers";

export const initialTransfersData: TransferRecord[] = [
  {
    id: "trf-1",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 45,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
  {
    id: "trf-2",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 18,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Dispatched",
  },
  {
    id: "trf-3",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 32,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
  {
    id: "trf-4",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 56,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
  {
    id: "trf-5",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 21,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Cancelled",
  },
  {
    id: "trf-6",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 7,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Dispatched",
  },
  {
    id: "trf-7",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 78,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Cancelled",
  },
  {
    id: "trf-8",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 57,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
  {
    id: "trf-9",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 190,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
  {
    id: "trf-10",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 100,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
  {
    id: "trf-11",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 45,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
  {
    id: "trf-12",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 34,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
  {
    id: "trf-13",
    transferId: "TRF-0001",
    fromLocation: "Head Office, Dhaka",
    toLocation: "Uttara Branch, Dhaka",
    productsSummary: "5 Products",
    quantity: 23,
    dateTime: "25 May 2024, 10:30 AM",
    status: "Received",
  },
];

export class TransfersService {
  private static baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

  /**
   * Fetch transfer records with search and filters
   */
  static async getTransfers(params?: TransferQueryFilter): Promise<{ data: TransferRecord[]; total: number }> {
    let list = [...initialTransfersData];

    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (t) =>
          t.transferId.toLowerCase().includes(q) ||
          t.fromLocation.toLowerCase().includes(q) ||
          t.toLocation.toLowerCase().includes(q) ||
          t.productsSummary.toLowerCase().includes(q)
      );
    }

    if (params?.status) {
      list = list.filter((t) => t.status.toLowerCase() === params.status?.toLowerCase());
    }

    return Promise.resolve({
      data: list,
      total: 50,
    });
  }
}

