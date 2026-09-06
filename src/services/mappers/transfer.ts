import { TransferRecord } from "@/types/transfers";
import { toAmount } from "../apiClient";

/**
 * A stock transfer -> a row in the transfers table.
 *
 * Without this the table showed a status and six blanks: the API calls these
 * `reference_no`, `from_warehouse_code`, `to_warehouse_code` and `items`, and
 * there is no "products summary" or total quantity on the record at all —
 * both are read off the lines.
 */

const STATUS: Record<string, TransferRecord["status"]> = {
  DRAFT: "Draft",
  DISPATCHED: "Dispatched",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function whenOf(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw) return "—";
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return raw;
  const [day, time] = WHEN.format(at).split(", ");
  return `${day} - ${(time || "").toUpperCase()}`;
}

/** "Sony WH-1000XM5 +2 more", or the one name when that is all there is. */
function summarise(items: any[]): string {
  const names = items
    .map((i) => String(i?.productName ?? i?.product_name ?? i?.sku ?? "").trim())
    .filter(Boolean);
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1} more`;
}

export function toTransferRecord(row: any): TransferRecord {
  const items: any[] = Array.isArray(row?.items) ? row.items : [];
  return {
    id: String(row?.id ?? ""),
    transferId: String(row?.referenceNo ?? row?.reference_no ?? "—"),
    fromLocation: String(row?.fromWarehouseCode ?? row?.from_warehouse_code ?? "—"),
    toLocation: String(row?.toWarehouseCode ?? row?.to_warehouse_code ?? "—"),
    productsSummary: summarise(items),
    // The lines carry the quantity; the transfer itself does not.
    quantity: items.reduce((n, i) => n + toAmount(i?.quantity), 0),
    // Dispatch is the date a transfer is about; before that it is still a draft
    // and the date that means anything is when it was written.
    dateTime: whenOf(row?.dispatchedAt ?? row?.dispatched_at ?? row?.createdAt ?? row?.created_at),
    status: STATUS[String(row?.status || "").toUpperCase()] ?? "Draft",
  };
}
