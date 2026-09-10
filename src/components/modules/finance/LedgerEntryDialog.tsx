"use client";

import React, { useMemo, useState } from "react";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { FinanceService } from "@/services";
import { invalidate, queryKey, useQuery } from "@/lib/query/useQuery";
import { useSession } from "@/services/useSession";
import type { LedgerEntry, LedgerType } from "@/types/finance";

/**
 * Record money in or out, and amend what was recorded.
 *
 * The screen's ⋮ menu is only worth having if it leads somewhere, so this is
 * what Edit opens and what the Add button opens with nothing filled in.
 *
 * The TYPE is chosen when adding and fixed when editing. Income and expense
 * are different tables with different categories and opposite ledger signs, so
 * "make this expense an income" is a delete and a create, not a PATCH — and a
 * control that looked like it could do it would be lying.
 */

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export interface LedgerEntryDialogProps {
  open: boolean;
  /** The row being amended, or null when adding. */
  entry: LedgerEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function LedgerEntryDialog({
  open,
  entry,
  onClose,
  onSaved,
}: LedgerEntryDialogProps) {
  const editing = entry !== null;

  const [type, setType] = useState<LedgerType>("EXPENSE");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The inline "new category" field, when it is open. */
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { user: session } = useSession();
  const mayAddCategory =
    session?.permissions?.includes(
      type === "INCOME" ? "income_category.create" : "expense_category.create"
    ) ?? false;

  // Seeded when it OPENS, adjusted during render rather than in an effect —
  // setState in an effect body is a cascading render and a lint error here.
  // Without it, reopening on a different row shows the previous one's figures.
  const [wasOpen, setWasOpen] = useState(open);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const key = entry?.id ?? "new";
  if (open !== wasOpen || (open && seededFor !== key)) {
    setWasOpen(open);
    setSeededFor(open ? key : null);
    if (open) {
      setType(entry?.type ?? "EXPENSE");
      setCategoryId(entry?.categoryId ?? "");
      setAmount(entry ? String(entry.amount) : "");
      setDate(entry?.date || todayISO());
      setDescription(entry?.description ?? "");
      setError(null);
      setNewCategory(null);
    }
  }

  // Only once the dialog is open, and re-asked when the side changes: the two
  // sides have entirely different category lists.
  const { data: categories } = useQuery(
    queryKey("finance-categories", { type }),
    () => FinanceService.categories(type),
    { enabled: open }
  );
  const options = useMemo(() => categories ?? [], [categories]);

  /**
   * A category from the OTHER side cannot be saved against this one.
   *
   * Derived rather than cleared in an effect: switching Income to Expense
   * leaves the previous side's id in state for one render, and an effect that
   * cleared it would be a cascading render (and a lint error here). Treating
   * an id the list does not contain as "nothing selected" is the same result
   * without the extra pass — and it also keeps `valid` honest, so Save is
   * disabled for exactly as long as the selection is meaningless.
   */
  const selected = options.some((c) => c.id === categoryId) ? categoryId : "";

  const value = Number(amount);
  const valid = selected !== "" && Number.isFinite(value) && value > 0 && date !== "";

  const addCategory = async () => {
    const name = (newCategory ?? "").trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const made = await FinanceService.createCategory(type, name);
      // The list is a query, so it is refetched rather than pushed into —
      // otherwise the new row disappears the next time the dialog opens.
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
        type,
        categoryId: selected,
        amount: value,
        date,
        description: description.trim(),
      };
      if (editing && entry) await FinanceService.update(entry.id, input);
      else await FinanceService.create(input);
      onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : "That entry could not be saved."
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
      title={editing ? "Edit entry" : "Add entry"}
      width={520}
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
            {saving ? "Saving…" : editing ? "Save changes" : "Add entry"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        {/* The side of the books. Fixed once the entry exists. */}
        <div className="flex flex-col gap-[6px]">
          <span className={LABEL}>Type</span>
          {editing ? (
            <p className="text-[14px] text-[#525252]">
              <span className="font-medium text-[#1e1e1e]">
                {entry?.type === "INCOME" ? "Income" : "Expense"}
              </span>{" "}
              — income and expense are separate books, so this cannot be
              switched here. Delete it and add it on the other side.
            </p>
          ) : (
            <div className="flex gap-[10px]">
              {(
                [
                  { key: "INCOME" as const, label: "Income", ink: "#27b85e" },
                  { key: "EXPENSE" as const, label: "Expense", ink: "#ff0000" },
                ]
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setType(option.key)}
                  className={`flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-[8px] rounded-[10px] border border-solid text-[14px] font-semibold transition-colors ${
                    type === option.key
                      ? "border-[#f5b800] bg-[#fffdf5]"
                      : "border-[#eaeaea] bg-white hover:bg-[#fafafa]"
                  }`}
                  style={{ color: type === option.key ? option.ink : "#525252" }}
                >
                  <span
                    className="size-[10px] rounded-full"
                    style={{ backgroundColor: option.ink }}
                  />
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

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
          {/* A shop starts with NO income categories, so a required dropdown
              with nothing in it was a dead end — the whole income side could
              not be used until somebody created one through the API. */}
          {newCategory === null ? (
            <div className="flex items-center gap-[8px]">
              {options.length === 0 && (
                <span className="text-[12px] text-[#8f8d87]">
                  This shop has no {type === "INCOME" ? "income" : "expense"} categories yet.
                </span>
              )}
              {mayAddCategory && (
                <button
                  type="button"
                  onClick={() => setNewCategory("")}
                  className="cursor-pointer text-[12px] font-medium text-[#b58600] underline underline-offset-2"
                >
                  + New category
                </button>
              )}
            </div>
          ) : (
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
                placeholder={type === "INCOME" ? "e.g. Membership" : "e.g. Rent"}
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
              <button
                type="button"
                disabled={creating}
                onClick={() => setNewCategory(null)}
                className="h-[38px] shrink-0 cursor-pointer px-[8px] text-[13px] font-medium text-[#525252]"
              >
                Cancel
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
            <span className={LABEL}>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${FIELD} cursor-pointer`}
            />
          </label>
        </div>

        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>Description</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was it for?"
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
