"use client";

import React, { useState } from "react";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import ProductImage from "@/components/shared/ProductImage";
import { ProductItem } from "@/types/pos";
import { PosService, StockService } from "@/services";
import { sellingBranch, sellingWarehouse } from "@/services/posService";
import { useSession } from "@/services/useSession";
import { invalidate } from "@/lib/query/useQuery";

/**
 * A scanned item the shelf does not have — and the shortest way out of it.
 *
 * Stopped HERE rather than at the payment screen. The server refuses a sale it
 * has no stock for, so a line added anyway would be rung up, discounted,
 * tendered — and refused at the last step, leaving a cashier to unpick a basket
 * in front of a queue with no idea which line caused it.
 *
 * The usual cause is not theft. It is goods that arrived and were never counted
 * in: a delivery signed for at the back door, a case broken open on the shelf, a
 * carton somebody brought over from the other branch. The stock is real and the
 * count is stale, and the shop is standing at the till holding the item. So this
 * asks for the two numbers that fix it — how many, and what they cost — writes
 * a stock correction, and rings the item up.
 *
 * The cost is REQUIRED and cannot be defaulted away. An empty line carries no
 * weighted average for arriving units to inherit, so the API refuses the
 * adjustment with ADJUSTMENT_COST_REQUIRED rather than let the first sale
 * compute its profit against a cost of zero — a sale that would look like pure
 * margin forever, because COGS is stamped once and never recomputed.
 *
 * Counting stock in is `inventory.adjust`, which a cashier deliberately does not
 * hold: it is the permission that lets somebody write stock into existence, and
 * the shrinkage it can hide is exactly what it is withheld for. Without it this
 * says so and names who to call, rather than showing a form that 403s.
 */

/** Goods with a supplier invoice belong on a purchase order, not here. */
const PURCHASE_HINT =
  "For a delivery with an invoice, raise a purchase instead — that records what is owed to the supplier.";

export default function OutOfStockDialog({
  product,
  onClose,
  onRestocked,
}: {
  product: ProductItem | null;
  onClose: () => void;
  /** Called once the stock is real, so the till can ring the item up. */
  onRestocked: (product: ProductItem) => void;
}) {
  const session = useSession();
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mayAdjust = (session.user?.permissions ?? []).includes("inventory.adjust");

  const restock = async () => {
    if (!product || saving) return;
    const qty = Number(quantity);
    const cost = Number(unitCost);
    if (!quantity.trim() || !Number.isFinite(qty) || qty <= 0) {
      return setError("Enter how many arrived, greater than zero.");
    }
    if (!unitCost.trim() || !Number.isFinite(cost) || cost <= 0) {
      return setError("Enter what one unit cost. Stock counted in at nothing makes every later sale look like pure profit.");
    }

    setSaving(true);
    setError(null);
    try {
      const warehouseId = await sellingWarehouse(await sellingBranch());
      await StockService.adjustStock({
        warehouseId,
        variantId: product.id,
        // The shelf holds none — that is why this dialog is open — so the
        // count IS what arrived. `expectUnchanged` makes the API refuse rather
        // than write if that stopped being true while the form was open.
        newQuantity: qty,
        unitCost: cost,
        expectUnchanged: true,
        // The shelf held none — that is why this dialog opened. If somebody
        // counted the goods in from the back office while the cashier was
        // typing, this is refused rather than counted twice.
        expectedQuantity: 0,
        referenceNo: `TILL-${Date.now().toString().slice(-8)}`,
        reason: "CORRECTION",
        note: note.trim() || `Counted in at the till: ${product.name}`,
      });
      // The shelf, the product wall, the transfers screen and the dashboard all
      // count this line.
      invalidate("stock", "inventory", "transfers", "dashboard", "pos-products");

      /**
       * Re-read the product before it goes in the cart.
       *
       * The copy in hand was resolved when the code was SCANNED, and what
       * happens between a scan and this button is exactly the window in which
       * somebody in the back office finishes editing the thing the queue is
       * waiting for. Reusing the snapshot put its old price on the line — the
       * server would still have charged the current one at checkout, so the
       * cashier quoted one figure and the receipt carried another.
       *
       * The lookup is authoritative and versioned on the server, so this is the
       * current price by construction. If it fails — the code was never on the
       * product, the network blinked — the snapshot still rings up with the
       * stock this dialog just created, because refusing to add an item the
       * shop has just counted in would be the worse answer.
       */
      const fresh = product.barcode
        ? await PosService.lookupBarcode(product.barcode).catch(() => null)
        : null;
      onRestocked(fresh ?? { ...product, stock: qty });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "The stock could not be counted in. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const FIELD =
    "flex h-[44px] w-full items-center rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] outline-none shadow-[inset_0_0_0_1px_#eaeaea] placeholder:text-[#a3a3a3]";
  const LABEL = "text-[13px] leading-[1.4] font-medium tracking-[-0.26px] text-[#1e1e1e]";

  return (
    <Modal
      open={product !== null}
      onClose={onClose}
      title="Out of stock"
      width={460}
      footer={
        <div className="flex justify-end gap-[8px]">
          <button type="button" onClick={onClose} className={MODAL_GHOST}>
            Close
          </button>
          {mayAdjust && (
            <button
              type="button"
              onClick={() => void restock()}
              disabled={saving}
              className={MODAL_PRIMARY}
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              {saving ? "Counting in…" : "Count in and add"}
            </button>
          )}
        </div>
      }
    >
      {product && (
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-[14px]">
            <span className="relative size-[56px] shrink-0 overflow-hidden rounded-[10px] bg-[#fafafa]">
              <ProductImage src={product.image} alt="" sizes="56px" />
            </span>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <p className="truncate text-[16px] leading-[1.35] font-semibold tracking-[-0.32px] text-[#1e1e1e]">
                {product.name}
              </p>
              <p className="truncate font-mono text-[12px] leading-[1.4] text-[#a3a3a3]">
                {product.barcode || product.sku}
              </p>
              <span className="mt-[2px] flex h-[22px] w-fit items-center rounded-[6px] bg-[#fef6f5] px-[8px] text-[12px] font-medium text-[#ef4444]">
                {product.stock < 0 ? `${product.stock} on hand` : "None on the shelf"}
              </span>
            </div>
          </div>

          <p className="text-[14px] leading-[1.6] text-[#525252]">
            It has not been added to the sale.{" "}
            {mayAdjust
              ? "If the goods are here and the count is simply behind, count them in and it will be rung up."
              : "The count says there are none left."}
          </p>

          {mayAdjust ? (
            <div className="flex flex-col gap-[12px]">
              <div className="flex gap-[10px]">
                <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                  <span className={LABEL}>How many arrived</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0"
                    className={`${FIELD} tabular-nums`}
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
                  <span className={LABEL}>Cost per unit</span>
                  <div className={`${FIELD} gap-[6px]`}>
                    <span className="shrink-0 text-[14px] text-[#a3a3a3]">৳</span>
                    <input
                      inputMode="decimal"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0.00"
                      className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
                    />
                  </div>
                </label>
              </div>

              <label className="flex flex-col gap-[6px]">
                <span className={LABEL}>
                  Note <span className="font-normal text-[#a3a3a3]">— optional</span>
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Where it came from, who brought it"
                  className={FIELD}
                />
              </label>

              {quantity && unitCost && (
                <p className="text-[13px] leading-[1.5] text-[#525252]">
                  Counting in{" "}
                  <span className="font-medium text-[#1e1e1e]">{Number(quantity) || 0}</span> at ৳
                  <span className="font-medium text-[#1e1e1e]">{Number(unitCost) || 0}</span> each —{" "}
                  <span className="font-medium text-[#1e1e1e]">
                    ৳{((Number(quantity) || 0) * (Number(unitCost) || 0)).toLocaleString("en-IN")}
                  </span>{" "}
                  onto the shelf.
                </p>
              )}

              <p className="text-[12px] leading-[1.5] text-[#a3a3a3]">{PURCHASE_HINT}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-[6px] rounded-[10px] bg-[#fafafa] p-[12px] text-[13px] leading-[1.6] text-[#525252]">
              <p className="font-medium text-[#1e1e1e]">Ask a supervisor</p>
              <p>
                Counting stock in needs the inventory permission, which a till login does not
                carry. A manager can do it from Inventory → Stock, or on this screen with their
                own login.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-[10px] bg-[#fef6f5] px-[12px] py-[10px] text-[13px] leading-[1.5] text-[#ef4444]">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
