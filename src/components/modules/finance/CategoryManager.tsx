"use client";

import React, { useMemo, useState } from "react";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { FinanceService } from "@/services";
import { invalidate, queryKey, useQuery } from "@/lib/query/useQuery";
import { useSession } from "@/services/useSession";
import type { LedgerType } from "@/types/finance";

/**
 * The two category lists a shop files its vouchers under.
 *
 * Income and expense categories are separate tables on purpose — nobody wants
 * "Rent" offered when recording a membership fee — so this shows one side at a
 * time rather than merging them into a list with a type column.
 *
 * Deleting is offered and often refused, and both are correct. The FK is
 * `on_delete=RESTRICT`, so a category with entries filed under it cannot go:
 * removing it would either orphan a year of rent payments or take them with
 * it, and both lose money the shop actually spent. The refusal is shown as the
 * server's own sentence rather than hidden behind a disabled button, because
 * this screen does not know the count and a button disabled on a guess is
 * worse than one that explains itself.
 */

export interface CategoryManagerProps {
  open: boolean;
  onClose: () => void;
  /** Which side to open on — the list the voucher filter is currently showing. */
  initialType?: LedgerType;
}

export default function CategoryManager({
  open,
  onClose,
  initialType = "EXPENSE",
}: CategoryManagerProps) {
  const [type, setType] = useState<LedgerType>(initialType);
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setType(initialType);
      setAdding("");
      setEditingId(null);
      setError(null);
      setNote(null);
    }
  }

  const { data: categories, loading } = useQuery(
    queryKey("finance-categories", { type }),
    () => FinanceService.categories(type),
    { enabled: open }
  );
  const rows = useMemo(() => categories ?? [], [categories]);

  const { user: session } = useSession();
  const held = session?.permissions ?? [];
  const prefix = type === "INCOME" ? "income_category" : "expense_category";
  const mayCreate = held.includes(`${prefix}.create`);
  const mayUpdate = held.includes(`${prefix}.update`);
  const mayDelete = held.includes(`${prefix}.delete`);

  /** Every write ends the same way: refresh the list and say what happened. */
  const run = async (job: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await job();
      // Both keys: the dialogs read `finance-categories`, and the voucher list
      // shows the category NAME on every row, so a rename has to reach it.
      invalidate("finance-categories", "vouchers");
      setNote(done);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const FIELD =
    "h-[40px] w-full rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[12px] text-[14px] text-[#1e1e1e] outline-none transition-colors focus:border-[#f5b800]";

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Voucher categories"
      width={560}
      footer={
        <button type="button" className={MODAL_GHOST} disabled={busy} onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <div className="flex gap-[10px]">
          {(
            [
              { key: "EXPENSE" as const, label: "Expense categories" },
              { key: "INCOME" as const, label: "Income categories" },
            ]
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setType(option.key);
                setEditingId(null);
                setError(null);
                setNote(null);
              }}
              className={`h-[38px] flex-1 cursor-pointer rounded-[10px] border border-solid text-[13px] font-semibold transition-colors ${
                type === option.key
                  ? "border-[#f5b800] bg-[#fffdf5] text-[#1e1e1e]"
                  : "border-[#eaeaea] bg-white text-[#525252] hover:bg-[#fafafa]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mayCreate && (
          <div className="flex items-center gap-[8px]">
            <input
              type="text"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !adding.trim()) return;
                e.preventDefault();
                void run(async () => {
                  await FinanceService.createCategory(type, adding);
                  setAdding("");
                }, "Category added.");
              }}
              placeholder={type === "INCOME" ? "e.g. Membership" : "e.g. Rent"}
              aria-label="New category name"
              className={FIELD}
            />
            <button
              type="button"
              disabled={busy || !adding.trim()}
              onClick={() =>
                void run(async () => {
                  await FinanceService.createCategory(type, adding);
                  setAdding("");
                }, "Category added.")
              }
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} h-[40px] shrink-0`}
            >
              Add
            </button>
          </div>
        )}

        <div className="max-h-[320px] overflow-y-auto rounded-[10px] border border-solid border-[#eaeaea]">
          {loading && (
            <p className="px-[12px] py-[16px] text-[13px] text-[#8f8d87]">Loading…</p>
          )}
          {!loading && rows.length === 0 && (
            <p className="px-[12px] py-[16px] text-[13px] text-[#8f8d87]">
              No {type === "INCOME" ? "income" : "expense"} categories yet.
            </p>
          )}
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-[8px] border-b border-solid border-[#f2f2f2] px-[12px] py-[8px] last:border-b-0"
            >
              {editingId === row.id ? (
                <>
                  <input
                    type="text"
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingId(null);
                      if (e.key !== "Enter" || !editingName.trim()) return;
                      e.preventDefault();
                      void run(async () => {
                        await FinanceService.renameCategory(type, row.id, editingName);
                        setEditingId(null);
                      }, "Category renamed.");
                    }}
                    aria-label={`Rename ${row.name}`}
                    className={`${FIELD} h-[34px]`}
                  />
                  <button
                    type="button"
                    disabled={busy || !editingName.trim()}
                    onClick={() =>
                      void run(async () => {
                        await FinanceService.renameCategory(type, row.id, editingName);
                        setEditingId(null);
                      }, "Category renamed.")
                    }
                    className="shrink-0 cursor-pointer text-[12px] font-semibold text-[#b58600]"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="shrink-0 cursor-pointer text-[12px] font-medium text-[#525252]"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[#1e1e1e]">
                    {row.name}
                  </span>
                  {mayUpdate && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(row.id);
                        setEditingName(row.name);
                      }}
                      className="shrink-0 cursor-pointer text-[12px] font-medium text-[#525252] hover:text-[#1e1e1e]"
                    >
                      Rename
                    </button>
                  )}
                  {mayDelete && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => FinanceService.removeCategory(type, row.id),
                          "Category deleted."
                        )
                      }
                      className="shrink-0 cursor-pointer text-[12px] font-medium text-[#c0392b] hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
          >
            {error}
          </p>
        )}
        {note && !error && <p className="text-[13px] text-[#525252]">{note}</p>}
      </div>
    </Modal>
  );
}
