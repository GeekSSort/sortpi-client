"use client";

import React, { useMemo, useState } from "react";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { FinanceService, RegularPaymentService, VoucherService } from "@/services";
import { invalidate, queryKey, useQuery } from "@/lib/query/useQuery";
import { useSession } from "@/services/useSession";
import type { Frequency, LedgerType, RegularPayment } from "@/types/finance";

/**
 * Set up or amend a regular payment.
 *
 * Editing IS offered here, unlike on the voucher screen, and the difference is
 * the whole point of the two screens. A voucher is a printed document — it has
 * been handed to somebody, so it is corrected by a void and a reissue. A
 * schedule is an arrangement: the rent going up is next month's figure, not a
 * correction to last month's payment, and every voucher already written stays
 * exactly as it was.
 */

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "WEEKLY", label: "Every week" },
  { value: "MONTHLY", label: "Every month" },
  { value: "QUARTERLY", label: "Every 3 months" },
  { value: "YEARLY", label: "Every year" },
];

export interface ScheduleDialogProps {
  open: boolean;
  /** The schedule being amended, or null when setting one up. */
  schedule: RegularPayment | null;
  onClose: () => void;
  onSaved: (saved: RegularPayment) => void;
}

export default function ScheduleDialog({
  open,
  schedule,
  onClose,
  onSaved,
}: ScheduleDialogProps) {
  const editing = schedule !== null;

  const [kind, setKind] = useState<LedgerType>("EXPENSE");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { user: session } = useSession();
  const mayAddCategory =
    session?.permissions?.includes(
      kind === "INCOME" ? "income_category.create" : "expense_category.create"
    ) ?? false;

  // Seeded when it OPENS, adjusted during render rather than in an effect —
  // setState in an effect body is a cascading render and a lint error here.
  // Without it, reopening on a different schedule shows the previous one.
  const [wasOpen, setWasOpen] = useState(open);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const key = schedule?.id ?? "new";
  if (open !== wasOpen || (open && seededFor !== key)) {
    setWasOpen(open);
    setSeededFor(open ? key : null);
    if (open) {
      setKind(schedule?.kind ?? "EXPENSE");
      setName(schedule?.name ?? "");
      setCategoryId(schedule?.categoryId ?? "");
      setAmount(schedule ? String(schedule.amount) : "");
      setFrequency(schedule?.frequency ?? "MONTHLY");
      setStartDate(schedule?.startDate || todayISO());
      setEndDate(schedule?.endDate ?? "");
      setAccountId(schedule?.paymentAccountId ?? "");
      setNotes(schedule?.notes ?? "");
      setError(null);
      setNewCategory(null);
    }
  }

  const { data: categories } = useQuery(
    queryKey("finance-categories", { type: kind }),
    () => FinanceService.categories(kind),
    { enabled: open }
  );
  const options = useMemo(() => categories ?? [], [categories]);

  const { data: accounts } = useQuery(
    queryKey("finance-money-accounts", {}),
    () => VoucherService.moneyAccounts(),
    { enabled: open, staleMs: 300_000 }
  );
  const wallets = useMemo(() => accounts ?? [], [accounts]);

  /** A category from the OTHER side cannot be saved against this one. */
  const selected = options.some((c) => c.id === categoryId) ? categoryId : "";

  const value = Number(amount);
  const valid =
    selected !== "" && Number.isFinite(value) && value > 0 && startDate !== "";

  const addCategory = async () => {
    const label = (newCategory ?? "").trim();
    if (!label) return;
    setCreating(true);
    setError(null);
    try {
      const made = await FinanceService.createCategory(kind, label);
      invalidate("finance-categories");
      setCategoryId(made.id);
      setNewCategory(null);
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : "That category could not be created."
      );
    } finally {
      setCreating(false);
    }
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const input = {
        // Falls back to the category name on the server when this is blank —
        // "Rent" is a perfectly good name for the rent, and demanding one more
        // field before a shop can record its rent is friction for nothing.
        name: name.trim(),
        kind,
        categoryId: selected,
        amount: value,
        frequency,
        startDate,
        endDate: endDate || null,
        paymentAccountId: accountId || null,
        notes: notes.trim(),
      };
      const saved = editing && schedule
        ? await RegularPaymentService.update(schedule.id, input)
        : await RegularPaymentService.create(input);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : "That schedule could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const FIELD =
    "h-[42px] w-full rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[12px] text-[14px] text-[#1e1e1e] outline-none transition-colors focus:border-[#f5b800]";
  const LABEL = "text-[13px] font-medium text-[#525252]";

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={editing ? "Edit regular payment" : "New regular payment"}
      width={560}
      footer={
        <>
          <button type="button" className={MODAL_GHOST} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || saving}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className={MODAL_PRIMARY}
            onClick={save}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add schedule"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <div className="flex flex-col gap-[6px]">
          <span className={LABEL}>Type</span>
          <div className="flex gap-[10px]">
            {(
              [
                { key: "EXPENSE" as const, label: "Money out", ink: "#c0392b" },
                { key: "INCOME" as const, label: "Money in", ink: "#1f9d55" },
              ]
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setKind(option.key)}
                className={`flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-[8px] rounded-[10px] border border-solid text-[14px] font-semibold transition-colors ${
                  kind === option.key
                    ? "border-[#f5b800] bg-[#fffdf5]"
                    : "border-[#eaeaea] bg-white hover:bg-[#fafafa]"
                }`}
                style={{ color: kind === option.key ? option.ink : "#525252" }}
              >
                <span
                  className="size-[10px] rounded-full"
                  style={{ backgroundColor: option.ink }}
                />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "INCOME" ? "e.g. Sublet rent" : "e.g. Shop rent"}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>Category</span>
          <select
            value={selected}
            onChange={(e) => setCategoryId(e.target.value)}
            className={`${FIELD} cursor-pointer`}
          >
            <option value="">Pick a category…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          {newCategory === null
            ? mayAddCategory && (
                <button
                  type="button"
                  onClick={() => setNewCategory("")}
                  className="self-start cursor-pointer text-[12px] font-medium text-[#b58600] underline underline-offset-2"
                >
                  + New category
                </button>
              )
            : (
              <div className="flex items-center gap-[8px]">
                <input
                  type="text"
                  autoFocus
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addCategory();
                    }
                    if (e.key === "Escape") setNewCategory(null);
                  }}
                  placeholder={kind === "INCOME" ? "e.g. Sublet" : "e.g. Rent"}
                  aria-label="New category name"
                  className={`${FIELD} h-[38px]`}
                />
                <button
                  type="button"
                  disabled={creating || !newCategory.trim()}
                  onClick={() => void addCategory()}
                  className="h-[38px] shrink-0 cursor-pointer rounded-[9px] bg-[#f5b800] px-[12px] text-[13px] font-semibold text-white transition-colors hover:bg-[#e5a612] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "Adding…" : "Add"}
                </button>
              </div>
            )}
        </label>

        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>Amount</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.00"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>How often</span>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className={`${FIELD} cursor-pointer`}
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>First due on</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`${FIELD} cursor-pointer`}
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>Until (optional)</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`${FIELD} cursor-pointer`}
            />
          </label>
        </div>

        {/* The day of the month is taken from the first due date, and it is
            taken ONCE: rent due on the 31st clamps to 28 February and comes
            back to 31 March rather than walking backwards through the year. */}
        {editing && schedule && schedule.paidCount > 0 && (
          <p className="rounded-[10px] bg-[#fffdf5] px-[12px] py-[10px] text-[12px] leading-[1.6] text-[#8a6d00]">
            {schedule.paidCount} payment{schedule.paidCount === 1 ? "" : "s"} have already
            been made against this schedule. Changing the amount affects the next one only —
            the vouchers already written stay as they are.
          </p>
        )}

        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>{kind === "INCOME" ? "Received into" : "Paid from"}</span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={`${FIELD} cursor-pointer`}
          >
            <option value="">Cash drawer</option>
            {wallets.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>Note</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this arrangement"
            className={FIELD}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
