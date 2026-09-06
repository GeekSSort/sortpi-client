"use client";

import React, { useEffect, useState } from "react";
import { ApiError } from "@/services/apiClient";
import { PlatformService, InvoiceRow, toDate, toLabel } from "@/services/platformService";
import ConsoleList, { Column, Stat } from "@/components/platform/ConsoleList";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import { formatMoney } from "@/lib/format";
import RowActionMenu from "@/components/shared/RowActionMenu";
import { statMoney, statRisk, statTotal, statWait } from "@/components/platform/stats";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";

/**
 * What we billed each company.
 *
 * Invoices are written by the nightly billing job, so this is empty until that
 * has run at least once.
 */

const TONE: Record<string, Tone> = {
  PAID: "green",
  OPEN: "orange",
  DRAFT: "slate",
  VOID: "slate",
  OVERDUE: "rose",
};

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";
const FILTERS = ["All invoices", "Paid", "Open", "Overdue", "Void"] as const;
// The billing rails, not the shop's: no cash drawer here.
const METHODS = ["BANK_TRANSFER", "MOBILE_BANKING", "CARD", "MANUAL"] as const;



export default function PlatformInvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All invoices");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [payOf, setPayOf] = useState<InvoiceRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [voidOf, setVoidOf] = useState<InvoiceRow | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [invoices, tenantNames] = await Promise.all([
          PlatformService.listInvoices(),
          PlatformService.tenantNames(),
        ]);
        if (cancelled) return;
        setRows(invoices.data);
        setNames(tenantNames);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load invoices.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const act = async (fn: () => Promise<void>, done: string) => {
    setSaving(true);
    try {
      await fn();
      setNote(done);
      setPayOf(null);
      setVoidOf(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setNote(PlatformService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (r: InvoiceRow) => names.get(r.organizationId) || r.organizationId.slice(0, 8);
  const needle = search.trim().toLowerCase();
  const byFilter = rows.filter((r) =>
    filter === "All invoices" ? true : r.status === filter.toUpperCase()
  );
  const shown = needle
    ? byFilter.filter(
        (r) => nameOf(r).toLowerCase().includes(needle) || r.number.toLowerCase().includes(needle)
      )
    : byFilter;

  const columns: Column<InvoiceRow>[] = [
    { key: "number", label: "Invoice", width: "1fr", mobile: true, cell: (r) => <span className="truncate text-[14px] font-medium text-[#1e1e1e]">{r.number}</span> },
    { key: "company", label: "Company", width: "1.4fr", mobile: true, cell: (r) => <span className={BODY}>{nameOf(r)}</span> },
    { key: "total", label: "Amount", width: "1fr", mobile: true, cell: (r) => <span className={BODY}>{formatMoney(r.total)}</span> },
    {
      key: "due",
      label: "Still owed",
      width: "1fr",
      mobile: true,
      cell: (r) => (
        <span className={r.amountDue > 0 ? "text-[14px] font-medium text-[#e63946]" : BODY}>
          {formatMoney(r.amountDue)}
        </span>
      ),
    },
    { key: "issued", label: "Issued", width: "1fr", mobile: true, cell: (r) => <span className={BODY}>{toDate(r.issuedAt)}</span> },
    { key: "due", label: "Due", width: "1fr", cell: (r) => <span className={BODY}>{toDate(r.dueAt)}</span> },
    {
      key: "status",
      label: "Status",
      width: "150px",
      align: "center",
      cell: (r) => <StatusPill label={toLabel(r.status)} tone={TONE[r.status] ?? "slate"} />,
    },
    {
      key: "action",
      label: "Action",
      width: "83px",
      align: "center",
      cell: (r) => (
        <RowActionMenu
          label={`Actions for ${r.number}`}
          actions={
            r.status === "PAID" || r.status === "VOID"
              ? [{ label: "Nothing to do", onSelect: () => setNote(`${r.number} is ${toLabel(r.status).toLowerCase()}.`) }]
              : [
                  {
                    label: "Record payment",
                    onSelect: () => {
                      setAmount(String(r.amountDue || r.total));
                      setMethod("BANK_TRANSFER");
                      setPayOf(r);
                    },
                  },
                  {
                    label: "Void invoice",
                    onSelect: () => {
                      setReason("");
                      setVoidOf(r);
                    },
                  },
                ]
          }
        />
      ),
    },
  ];

  // Money, not document state: an invoice can be part paid and still say OPEN,
  // so counting by status showed nothing received.
  const received = rows.reduce((total, r) => total + r.amountPaid, 0);
  const owed = rows.reduce((total, r) => total + r.amountDue, 0);
  const overdue = rows
    .filter((r) => r.status !== "PAID" && r.status !== "VOID" && r.dueAt && new Date(r.dueAt) < new Date())
    .reduce((total, r) => total + r.amountDue, 0);
  const stats: Stat[] = [
    statTotal({ label: "Invoices", value: rows.length }),
    statMoney({ label: "Received", value: formatMoney(received), note: "paid to us" }),
    statWait({ label: "Owed", value: formatMoney(owed), note: "sent, not paid" }),
    statRisk({
      label: "Overdue",
      value: overdue > 0 ? formatMoney(overdue) : 0,
      note: "past the due date",
    }),
  ];

  return (
    <>
      <ConsoleList
        rows={shown}
        stats={stats}
        columns={columns}
        loading={loading}
        error={error}
        note={note}
        filters={FILTERS}
        onFilter={setFilter}
        minWidth={1150}
        onSearch={setSearch}
        searchPlaceholder="Search by invoice or company..."
        emptyLine="No invoices yet. They appear once the nightly billing job has run, or when you issue one from Subscriptions."
      />

      <Modal
        open={payOf !== null}
        onClose={() => setPayOf(null)}
        title="Record a payment"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setPayOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !amount}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                payOf &&
                act(
                  () => PlatformService.recordPayment(payOf.id, Number(amount) || 0, method),
                  `Payment recorded against ${payOf.number}.`
                )
              }
            >
              {saving ? "Recording..." : "Record payment"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] text-[#525252]">
            {payOf?.number} for {payOf ? nameOf(payOf) : ""} &mdash; {payOf ? formatMoney(payOf.total) : ""}.
          </p>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">How they paid</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={FIELD}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {toLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>

      <Modal
        open={voidOf !== null}
        onClose={() => setVoidOf(null)}
        title="Void this invoice"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setVoidOf(null)}>
              Keep it
            </button>
            <button
              type="button"
              disabled={saving}
              style={{ backgroundImage: RED_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() =>
                voidOf &&
                act(() => PlatformService.voidInvoice(voidOf.id, reason), `${voidOf.number} voided.`)
              }
            >
              {saving ? "Voiding..." : "Void invoice"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            <span className="font-medium text-[#1e1e1e]">{voidOf?.number}</span> stops counting as
            owed. The row stays, so the history still shows it was raised.
          </p>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-[#1e1e1e]">Why (optional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD} />
          </label>
        </div>
      </Modal>
    </>
  );
}
