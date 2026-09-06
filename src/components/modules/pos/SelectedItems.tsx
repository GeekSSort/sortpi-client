"use client";

import React from "react";
import { CartItem } from "@/types/pos";
import { formatMoney } from "@/lib/format";

/**
 * The middle column of the three-column till: what has been rung up so far.
 *
 * A plain table rather than the cards the classic view uses. With the basket in
 * its own column there is room for price, quantity and line total side by side,
 * which is what a cashier reads back to a customer.
 */

const HEAD = "text-[13px] font-medium tracking-[-0.26px] text-[#525252]";

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.5 7h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 3.5v7M3.5 7h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8l.7-8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SelectedItems({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}: {
  cart: CartItem[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
}) {
  const count = cart.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
      <div className="flex items-center justify-between gap-[12px] border-b border-[#eaeaea] px-[16px] py-[14px]">
        <p className="flex items-center gap-[8px] text-[16px] leading-[1.5] tracking-[-0.32px] text-[#1e1e1e]">
          <span className="font-medium">Selected items</span>
          <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#fdf7e6] px-[7px] text-[12px] font-semibold text-[#f5b800] tabular-nums">
            {count}
          </span>
        </p>
        <button
          type="button"
          onClick={onClearCart}
          disabled={!cart.length}
          className="cursor-pointer rounded-[8px] border border-solid border-[#eaeaea] px-[12px] py-[6px] text-[13px] font-medium text-[#525252] transition-colors hover:border-[#e63946] hover:text-[#e63946] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Clear
        </button>
      </div>

      <div className="flex items-center justify-between gap-[8px] border-b border-[#eaeaea] px-[16px] py-[10px]">
        <span className={HEAD}>Product</span>
        <span className={HEAD}>Sub total</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 && (
          <p className="py-[48px] text-center text-[14px] text-[#8f8d87]">
            Nothing rung up yet. Tap a product to start.
          </p>
        )}

        {cart.map((item) => (
          <div
            key={item.product.id}
            className="flex items-start justify-between gap-[10px] border-b border-[#f0ede6] px-[16px] py-[12px] transition-colors last:border-0 hover:bg-[#fafafa]"
          >
            {/* Name, then price and quantity beneath it: this column is half
                the width of the classic view, so five side-by-side cells left
                the product name with no room at all. */}
            <span className="flex min-w-0 flex-1 flex-col gap-[8px]">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-medium text-[#1e1e1e]">
                  {item.product.name}
                </span>
                <span className="truncate text-[12px] text-[#8f8d87]">{item.product.sku}</span>
              </span>

              <span className="flex items-center gap-[8px]">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => onUpdateQuantity(item.product.id, -1)}
                  className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-solid border-[#eaeaea] text-[#525252] transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
                >
                  <MinusIcon />
                </button>
                <span className="w-[22px] text-center text-[14px] font-medium text-[#1e1e1e] tabular-nums">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => onUpdateQuantity(item.product.id, 1)}
                  className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-solid border-[#eaeaea] text-[#525252] transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
                >
                  <PlusIcon />
                </button>
                <span className="truncate text-[12px] text-[#8f8d87]">
                  &times; {formatMoney(item.product.price, { decimals: 2 })}
                </span>
              </span>
            </span>

            <span className="flex shrink-0 flex-col items-end gap-[8px]">
              <span className="text-[14px] font-medium text-[#1e1e1e] tabular-nums">
                {formatMoney(item.product.price * item.quantity, { decimals: 2 })}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.product.name}`}
                onClick={() => onRemoveItem(item.product.id)}
                className="flex size-[26px] cursor-pointer items-center justify-center rounded-[7px] text-[#a3a3a3] transition-colors hover:bg-[#ffdfe2] hover:text-[#e63946]"
              >
                <BinIcon />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
