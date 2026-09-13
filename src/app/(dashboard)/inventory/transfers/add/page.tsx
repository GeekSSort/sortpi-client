"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StockItem } from "@/types/stock";
import { StockService, TransferService } from "@/services";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { useSession } from "@/services/useSession";
import { GOLD_GRADIENT } from "@/components/shared/Modal";
import { RefreshBar } from "@/components/shared/QueryBoundary";

/**
 * Draft a transfer — its own page, like Add Product and Add Stock.
 *
 * This was a 460px modal. A transfer note is a source, a destination and as
 * many product lines as the van holds, and each line carries a name, a SKU, an
 * availability and a quantity box — so the picker, the list of lines and the
 * two warehouse selects were stacked inside a dialog narrower than the table
 * behind it, with the lines scrolling in a box of their own. Filling one in for
 * six products meant working through a column the width of a phone on a
 * 1440px screen.
 *
 * Nothing about the logic changed in the move: the same `pickEnd` pinning, the
 * same source-shelf lookup, the same validation, the same single
 * `createTransfer` call. Only the room it happens in.
 */

const FORM_FIELD =
  "flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]";

const blank = { from: "", to: "" };

/** One product on a transfer note: the stock line it came from, and how many. */
interface TransferLine {
  stockLineId: string;
  variantId: string;
  name: string;
  sku: string;
  available: number;
  quantity: number;
}

/** A unique reference for one transfer. Module scope, because reading the
    clock is a side effect and does not belong in a component body. */
function transferRef(): string {
  return `TRF-${Date.now()}`;
}

export default function AddTransferPage() {
  const router = useRouter();
  const session = useSession();

  const [draft, setDraft] = useState({ ...blank });
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [pickQuery, setPickQuery] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const warehouseQuery = useQuery(queryKey("warehouses"), () => TransferService.getWarehouses());
  // MAIN warehouses only. TRANSIT is machinery — `dispatch` routes stock
  // through the source branch's transit warehouse by itself — so naming one as
  // an end of a transfer is not a choice a storeman has.
  const warehouses = useMemo(
    () => (warehouseQuery.data ?? []).filter((w) => w.type !== "TRANSIT"),
    [warehouseQuery.data]
  );

  /**
   * This branch's own shelf. One end of every transfer has to be it.
   *
   * Drafting Chattogram → Dhaka from Head Office is a movement between two
   * places the person is not, and the API refuses it anyway: `perform_create`
   * checks the caller may write to the SOURCE, so the pair could be filled in
   * completely and only fail on save.
   */
  const here = useMemo(
    () => warehouses.find((w) => w.branchId === session.user?.activeBranch?.id) ?? null,
    [warehouses, session.user?.activeBranch?.id]
  );
  const elsewhere = useMemo(
    () => warehouses.filter((w) => w.id !== here?.id),
    [warehouses, here]
  );

  /**
   * Pin this branch to whichever end the person did not just choose.
   *
   * Pick another branch to send FROM and this branch becomes the destination —
   * you are receiving. Pick one to send TO and this branch becomes the source.
   */
  const pickEnd = (end: "from" | "to", warehouseId: string) => {
    const next = { ...draft, [end]: warehouseId };
    if (here && warehouseId && warehouseId !== here.id) {
      next[end === "from" ? "to" : "from"] = here.id;
    }
    setDraft(next);
    // Only when the SOURCE moved. Changing the destination leaves the note
    // alone — those lines still came off the shelf they came off.
    if (next.from !== draft.from) {
      setLines([]);
      setPickQuery("");
    }
    setFormError(null);
  };

  // When the source shelf belongs to another branch — an INBOUND transfer —
  // the read has to say so, or branch scope answers empty and the picker looks
  // like an empty warehouse.
  const sourceBranchId = warehouses.find((w) => w.id === draft.from)?.branchId ?? "";
  const asBranch = sourceBranchId && sourceBranchId !== here?.branchId ? sourceBranchId : undefined;

  const sourceStockQuery = useQuery(
    queryKey("stock", { warehouse: draft.from, limit: 200, as: asBranch ?? "" }),
    () => StockService.getStock({ warehouse: draft.from, limit: 200 }, asBranch),
    { enabled: draft.from !== "" }
  );
  const sourceRows = sourceStockQuery.data?.data;
  const sourceStock: StockItem[] = useMemo(
    () => (draft.from ? (sourceRows ?? []).filter((r) => r.available > 0) : []),
    [draft.from, sourceRows]
  );

  /** On the source shelf, not already on the note, matching what was typed. */
  const pickable = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    const taken = new Set(lines.map((l) => l.stockLineId));
    return sourceStock
      .filter((r) => !taken.has(r.id))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q))
      .slice(0, 40);
  }, [sourceStock, lines, pickQuery]);

  const addLine = (row: StockItem) => {
    // The variant is what the API moves, so a line without one is caught here
    // rather than at submit, where the whole note has already been built.
    const variantId = row.variantId;
    if (!variantId) return setFormError("That line is missing its variant.");
    setLines((current) => [
      ...current,
      {
        stockLineId: row.id,
        variantId,
        name: row.name,
        sku: row.sku,
        available: row.available,
        quantity: 1,
      },
    ]);
    setPickQuery("");
    setPickOpen(false);
    setFormError(null);
  };

  const setLineQuantity = (stockLineId: string, next: number) =>
    setLines((current) =>
      current.map((l) =>
        l.stockLineId === stockLineId
          ? { ...l, quantity: Math.max(0, Math.min(l.available, next)) }
          : l
      )
    );

  const removeLine = (stockLineId: string) =>
    setLines((current) => current.filter((l) => l.stockLineId !== stockLineId));

  const createTransfer = async () => {
    if (!draft.from) return setFormError("Pick a source warehouse.");
    if (!draft.to) return setFormError("Pick a destination warehouse.");
    if (draft.from === draft.to) return setFormError("Source and destination must differ.");
    if (here && draft.from !== here.id && draft.to !== here.id) {
      return setFormError(`A transfer has to start or end at ${here.name}.`);
    }
    if (lines.length === 0) return setFormError("Add at least one product to send.");

    const empty = lines.find((l) => l.quantity <= 0);
    if (empty) return setFormError(`Enter a quantity for ${empty.name}.`);
    const over = lines.find((l) => l.quantity > l.available);
    if (over) return setFormError(`Only ${over.available} of ${over.name} available there.`);

    setSaving(true);
    setFormError(null);
    try {
      // A draft. Nothing leaves the shelf until it is dispatched.
      const created = await TransferService.createTransfer(
        {
          referenceNo: transferRef(),
          fromWarehouseId: draft.from,
          toWarehouseId: draft.to,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        },
        // Drafting stock OUT of another branch is asking that branch to send
        // it, so the request says which branch it is made on behalf of.
        asBranch
      );
      invalidate("transfers");
      setNote(`${created.transferId} drafted — dispatch it to move the stock`);
      // Back to the list, which is where the new draft is and where it gets
      // dispatched from.
      window.setTimeout(() => router.push("/inventory/transfers"), 600);
    } catch (err) {
      setFormError(
        err instanceof Error && err.message ? err.message : "The transfer could not be created."
      );
    } finally {
      setSaving(false);
    }
  };

  const LABEL = "text-[14px] font-medium tracking-[-0.28px] text-[#525252]";

  return (
    <div className="flex w-full flex-col gap-[14px] pb-[24px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void createTransfer();
        }}
        // 720px and the 60px centred header are what Add Product, Add Stock
        // and Add Purchase use. An Add page that is its own width is the one
        // somebody notices.
        className="mx-auto flex w-full max-w-[720px] flex-col gap-[16px]"
      >
        <div className="relative w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
          <RefreshBar active={warehouseQuery.fetching || sourceStockQuery.fetching} />

          <div className="flex h-[60px] items-center justify-center px-[16px]">
            <h1 className="text-[20px] leading-[28px] font-semibold tracking-[-0.4px] text-[#1e1e1e]">
              New Transfer
            </h1>
          </div>

          <div className="flex flex-col gap-[16px] px-[16px] pt-[9px] pb-[16px]">
            {/* The two ends. */}
            <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
              {(["from", "to"] as const).map((k) => {
                const other = k === "from" ? draft.to : draft.from;
                return (
                  <label key={k} className="flex flex-col gap-[6px]">
                    <span className={LABEL}>{k === "from" ? "From" : "To"}</span>
                    <select
                      value={draft[k]}
                      aria-label={k === "from" ? "Transfer from" : "Transfer to"}
                      onChange={(e) => pickEnd(k, e.target.value)}
                      className={`${FORM_FIELD} cursor-pointer`}
                    >
                      <option value="">Select a warehouse</option>
                      {/* The OTHER end is left off — the API refuses a transfer
                          to the warehouse it came from, so offering it is
                          offering a choice that can only end in an error. */}
                      {(here ? [here, ...elsewhere] : warehouses)
                        .filter((w) => w.id !== other)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                            {here && w.id === here.id ? " (here)" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                );
              })}
            </div>

            {/* Says what just happened, because the other end filling itself in
                is otherwise a surprise. */}
            {here && (draft.from || draft.to) && (
              <p className="text-[12px] leading-[1.5] text-[#8a8a8a]">
                {draft.from === here.id && draft.to
                  ? `Sending out of ${here.name}.`
                  : draft.to === here.id && draft.from
                    ? `Receiving into ${here.name} — only ${
                        warehouses.find((w) => w.id === draft.from)?.name ?? "that branch"
                      } can dispatch it.`
                    : `${here.name} is one end of every transfer you make here.`}
              </p>
            )}

            {/* Type a name, pick it, set how many — as many times as the van
                holds. */}
            <div className="flex flex-col gap-[6px]">
              <span className={LABEL}>Products</span>
              <div className="relative">
                <input
                  value={pickQuery}
                  disabled={!draft.from}
                  onChange={(e) => {
                    setPickQuery(e.target.value);
                    setPickOpen(true);
                    setFormError(null);
                  }}
                  onFocus={() => setPickOpen(true)}
                  // A click on an option has to land before the list closes.
                  onBlur={() => window.setTimeout(() => setPickOpen(false), 140)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pickable.length > 0) {
                      e.preventDefault();
                      addLine(pickable[0]);
                    }
                    if (e.key === "Escape") setPickOpen(false);
                  }}
                  placeholder={
                    draft.from
                      ? "Search a product in that warehouse…"
                      : "Pick a source warehouse first"
                  }
                  aria-label="Product to transfer"
                  className={`${FORM_FIELD} w-full disabled:opacity-60`}
                />
                {pickOpen && draft.from && (
                  <div className="absolute top-[48px] right-0 left-0 z-40 max-h-[260px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                    {sourceStockQuery.loading && (
                      <p className="px-[14px] py-[9px] text-[13px] text-[#8f8d87]">
                        Loading stock…
                      </p>
                    )}
                    {!sourceStockQuery.loading && pickable.length === 0 && (
                      <p className="px-[14px] py-[9px] text-[13px] text-[#8f8d87]">
                        {pickQuery.trim()
                          ? "Nothing in that warehouse matches."
                          : "Everything in stock there is already on this note."}
                      </p>
                    )}
                    {pickable.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => addLine(r)}
                        className="flex w-full cursor-pointer items-center justify-between gap-[10px] px-[14px] py-[9px] text-left transition-colors hover:bg-[#fafafa]"
                      >
                        <span className="min-w-0 truncate text-[13px] text-[#525252]">
                          {r.name}
                          <span className="text-[#a3a3a3]"> · {r.sku}</span>
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums text-[#8f8d87]">
                          {r.available} available
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* The note. A real table here, which is the room the page bought. */}
            {lines.length > 0 && (
              <div className="overflow-hidden rounded-[10px] border border-solid border-[#eaeaea]">
                <div className="grid grid-cols-[1fr_120px_110px_60px] border-b border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[8px]">
                  {["Product", "Available", "Quantity", ""].map((h, i) => (
                    <span
                      key={h || i}
                      className="truncate text-[12px] font-medium tracking-[-0.24px] text-[#525252]"
                    >
                      {h}
                    </span>
                  ))}
                </div>
                {lines.map((l) => (
                  <div
                    key={l.stockLineId}
                    className="grid grid-cols-[1fr_120px_110px_60px] items-center border-b border-solid border-[#f2f2f2] px-[12px] py-[8px] last:border-b-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] text-[#1e1e1e]">{l.name}</span>
                      <span className="truncate text-[11px] text-[#8f8d87]">{l.sku}</span>
                    </span>
                    <span className="text-[13px] tabular-nums text-[#8f8d87]">
                      {l.available}
                    </span>
                    <input
                      value={String(l.quantity)}
                      onChange={(e) => {
                        setLineQuantity(
                          l.stockLineId,
                          Number(e.target.value.replace(/[^\d]/g, "")) || 0
                        );
                        setFormError(null);
                      }}
                      inputMode="numeric"
                      aria-label={`Quantity of ${l.name}`}
                      className="h-[36px] w-[80px] rounded-[8px] bg-white text-center text-[13px] tabular-nums text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(l.stockLineId)}
                      aria-label={`Remove ${l.name}`}
                      className="cursor-pointer justify-self-end px-[6px] text-[18px] leading-none text-[#a3a3a3] transition-colors hover:text-[#ef4444]"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <p className="bg-[#fafafa] px-[12px] py-[8px] text-[12px] text-[#8a8a8a]">
                  {lines.length} product{lines.length === 1 ? "" : "s"} ·{" "}
                  {lines.reduce((n, l) => n + l.quantity, 0)} units
                </p>
              </div>
            )}

            <p className="text-[12px] leading-[1.6] text-[#8a8a8a]">
              A new transfer is a draft. Dispatching it takes the stock off the source
              branch&rsquo;s shelf; receiving it puts the same units on the destination
              branch&rsquo;s. Nothing moves until then.
            </p>

            {formError && (
              <p
                role="alert"
                className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
              >
                {formError}
              </p>
            )}
            {note && (
              <p className="rounded-[10px] bg-[#f5fff8] px-[12px] py-[10px] text-[13px] font-medium text-[#00b837]">
                {note}
              </p>
            )}

            {/* The same 48px full-width gold submit every other Add page ends
                with, so the last thing on the screen is where muscle memory
                expects it. */}
            <button
              type="submit"
              disabled={saving}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className="flex h-[48px] w-full cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create Transfer"}
            </button>
            <Link
              href="/inventory/transfers"
              className="flex h-[48px] w-full cursor-pointer items-center justify-center rounded-[12px] bg-white px-[16px] text-[16px] leading-[24px] font-semibold text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]"
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
