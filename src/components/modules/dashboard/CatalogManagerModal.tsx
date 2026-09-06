"use client";

import React, { useMemo, useState } from "react";
import Modal, { GOLD_GRADIENT, MODAL_GHOST } from "@/components/shared/Modal";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { ErrorState, EmptyState, RefreshBar } from "@/components/shared/QueryBoundary";
import { CatalogService, type CatalogKind } from "@/services/inventoryService";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";

/**
 * Manage the categories and brands a shop sorts its products by.
 *
 * Both were read-only from the app's point of view: the add-product form
 * offered whatever the seeder had put there, and a shop that wanted a
 * category of its own had no way to make one short of the API. One modal
 * covers both because they are the same shape — an id and a name — and two
 * near-identical screens would drift.
 *
 * Renaming is in place rather than behind a second dialogue. The list is
 * short, the only editable field is the name, and a modal on top of a modal
 * for one text box is worse than an input that is already there.
 */

const LABELS: Record<CatalogKind, { title: string; one: string; many: string }> = {
  category: { title: "Manage Categories", one: "category", many: "categories" },
  brand: { title: "Manage Brands", one: "brand", many: "brands" },
};

const INPUT =
  "h-[44px] w-full rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[14px] text-[14px] leading-[1.5] tracking-[-0.28px] text-[#1e1e1e] outline-none transition-colors focus:border-[#f5b800] placeholder:text-[#a3a3a3]";

/** The server names the real problem; it is more use than "try again". */
function describe(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function CatalogManagerModal({
  kind,
  open,
  onClose,
}: {
  kind: CatalogKind;
  open: boolean;
  onClose: () => void;
}) {
  const label = LABELS[kind];
  const key = queryKey(kind === "category" ? "categories" : "brands");

  const { data, loading, fetching, error, refetch } = useQuery(
    key,
    () => CatalogService.list(kind),
    { enabled: open }
  );
  const rows = useMemo(() => data ?? [], [data]);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /**
   * The product lists carry a category and a brand NAME on every row, so a
   * rename here changes what those tables read. Invalidating them is what
   * stops the products screen showing the old name until it happens to
   * refetch.
   */
  // `pos-categories` too: the till's category chips are read from
  // `/categories/` now rather than from whichever products happened to be on
  // screen, so renaming one here has to reach that list.
  const refreshDependents = () =>
    invalidate(key, "inventory", "pos-products", "pos-categories");

  const reset = () => {
    setNewName("");
    setEditingId(null);
    setEditingName("");
    setConfirmId(null);
    setFormError(null);
    setNote(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return setFormError(`Give the ${label.one} a name.`);
    if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return setFormError(`${name} already exists.`);
    }
    setBusy(true);
    setFormError(null);
    try {
      await CatalogService.create(kind, name);
      setNewName("");
      setNote(`${name} added`);
      refreshDependents();
    } catch (err) {
      setFormError(describe(err, `Could not add the ${label.one}.`));
    } finally {
      setBusy(false);
    }
  };

  const save = async (id: string) => {
    const name = editingName.trim();
    if (!name) return setFormError("A name is required.");
    setBusy(true);
    setFormError(null);
    try {
      await CatalogService.rename(kind, id, name);
      setEditingId(null);
      setNote(`Renamed to ${name}`);
      refreshDependents();
    } catch (err) {
      setFormError(describe(err, "Could not rename it."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setFormError(null);
    try {
      await CatalogService.remove(kind, id);
      setConfirmId(null);
      setNote("Deleted");
      refreshDependents();
    } catch (err) {
      // The API refuses to delete one that products still point at, and that
      // sentence is the answer the person needs.
      setFormError(describe(err, `Could not delete the ${label.one}.`));
      setConfirmId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={label.title}
      width={560}
      footer={
        <button type="button" className={MODAL_GHOST} onClick={close}>
          Done
        </button>
      }
    >
      <div className="relative flex flex-col gap-[16px]">
        <RefreshBar active={fetching} />

        <div className="flex items-end gap-[10px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <label
              htmlFor="cat-new"
              className="text-[13px] leading-[1.5] font-medium tracking-[-0.26px] text-[#525252]"
            >
              New {label.one}
            </label>
            <input
              id="cat-new"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setFormError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
              placeholder={`e.g. ${kind === "category" ? "Beverages" : "Pran"}`}
              className={INPUT}
            />
          </div>
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="h-[44px] shrink-0 cursor-pointer rounded-[10px] px-[18px] text-[14px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add
          </button>
        </div>

        {formError && (
          <p role="alert" className="text-[13px] leading-[1.5] text-[#e63946]">
            {formError}
          </p>
        )}
        {note && !formError && (
          <p className="text-[13px] leading-[1.5] text-[#12855b]">{note}</p>
        )}

        <div className="max-h-[320px] overflow-y-auto rounded-[10px] shadow-[inset_0_0_0_1px_#eaeaea]">
          {loading && rows.length === 0 && (
            <div className="px-[14px]">
              <ListSkeleton rows={5} />
            </div>
          )}

          {!loading && Boolean(error) && rows.length === 0 && (
            <ErrorState
              message={`Could not load the ${label.many}.`}
              onRetry={refetch}
              compact
            />
          )}

          {!loading && !error && rows.length === 0 && (
            <EmptyState message={`No ${label.many} yet.`} hint="Add the first one above." compact />
          )}

          {rows.map((row, i) => (
            <div
              key={row.id}
              className={`flex items-center gap-[10px] px-[14px] py-[10px] ${
                i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"
              }`}
            >
              {editingId === row.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void save(row.id);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    aria-label={`Rename ${row.name}`}
                    className={`${INPUT} h-[36px]`}
                  />
                  <button
                    type="button"
                    onClick={() => void save(row.id)}
                    disabled={busy}
                    className="shrink-0 cursor-pointer text-[13px] font-medium text-[#12855b] disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="shrink-0 cursor-pointer text-[13px] text-[#525252]"
                  >
                    Cancel
                  </button>
                </>
              ) : confirmId === row.id ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-[14px] tracking-[-0.28px] text-[#1e1e1e]">
                    Delete {row.name}?
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(row.id)}
                    disabled={busy}
                    className="shrink-0 cursor-pointer text-[13px] font-medium text-[#e63946] disabled:opacity-60"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="shrink-0 cursor-pointer text-[13px] text-[#525252]"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[14px] tracking-[-0.28px] text-[#525252]">
                    {row.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(row.id);
                      setEditingName(row.name);
                      setFormError(null);
                    }}
                    className="shrink-0 cursor-pointer text-[13px] text-[#525252] transition-colors hover:text-[#1e1e1e]"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmId(row.id);
                      setFormError(null);
                    }}
                    className="shrink-0 cursor-pointer text-[13px] text-[#525252] transition-colors hover:text-[#e63946]"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
