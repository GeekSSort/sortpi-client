"use client";

import React from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { ProductItem } from "@/types/pos";
import { formatMoney } from "@/lib/format";

/**
 * What a product is, without leaving the grid.
 *
 * A tile has room for a name, a price and a stock pill. Hovering one opens this
 * beside it with the rest — SKU, category, what a full case comes to — so a
 * cashier answering "what is this one?" does not have to open another screen.
 *
 * Drawn in a portal at fixed coordinates: the grid scrolls inside its own box,
 * and a card positioned inside it would be clipped at the edges.
 */

const CARD_W = 260;
/** Roughly how tall the card is with its picture at full size. */
const CARD_H = 500;
/** Everything under the picture: name, SKU, the four rows and the footer. */
const BELOW_IMAGE = 250;

export interface PeekAnchor {
  product: ProductItem;
  /** The tile's box, so the card can sit beside it. */
  rect: { top: number; left: number; right: number; bottom: number };
}

export default function ProductPeek({ anchor }: { anchor: PeekAnchor | null }) {
  // Only a pointer or a focus opens this, and neither happens on the server.
  if (!anchor || typeof document === "undefined") return null;

  const { product, rect } = anchor;
  const margin = 12;

  // Beside the tile, or on its other side when there is no room.
  const roomRight = window.innerWidth - rect.right > CARD_W + margin * 2;
  const left = roomRight ? rect.right + margin : Math.max(margin, rect.left - CARD_W - margin);

  // A tile near the bottom of the screen opens its card higher up instead of
  // level with the tile, so the card ends above the bottom edge rather than
  // running off it. maxHeight is the backstop on a short window.
  const top = Math.max(margin, Math.min(rect.top, window.innerHeight - CARD_H - margin));
  const maxHeight = window.innerHeight - top - margin;

  const soldOut = product.stock <= 0;

  return createPortal(
    <div
      role="tooltip"
      style={{ top, left, width: CARD_W, maxHeight }}
      className="sp-fade pointer-events-none fixed z-[70] overflow-y-auto rounded-[12px] bg-white p-[14px] shadow-[0_18px_50px_rgba(0,0,0,0.18)] ring-1 ring-[#eaeaea]"
    >
      <div
        className="relative mb-[12px] w-full shrink-0 overflow-hidden rounded-[10px] bg-[#fafafa]"
        style={{ height: Math.max(90, Math.min(CARD_W - 28, maxHeight - BELOW_IMAGE)) }}
      >
        {product.image ? (
          <Image src={product.image} alt="" fill sizes="260px" className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[34px] font-semibold text-[#d4d4d4]">
            {product.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <p className="text-[15px] leading-[1.35] font-medium text-[#1e1e1e]">{product.name}</p>
      <p className="mt-[2px] text-[12px] text-[#8f8d87]">{product.sku}</p>

      <dl className="mt-[12px] flex flex-col gap-[8px] text-[13px]">
        {(
          [
            ["Category", product.category],
            ["Price", formatMoney(product.price, { decimals: 2 })],
            ["In this branch", soldOut ? "None left" : `${product.stock} in stock`],
            [
              "Ten of these",
              formatMoney(product.price * 10, { decimals: 2 }),
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-[10px]">
            <dt className="text-[#8f8d87]">{label}</dt>
            <dd
              className="truncate font-medium"
              style={{ color: label === "In this branch" && soldOut ? "#e63946" : "#1e1e1e" }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-[12px] border-t border-[#f0ede6] pt-[10px] text-[12px] text-[#8f8d87]">
        {soldOut ? "Cannot be sold from this branch." : "Click the tile to add one to the basket."}
      </p>
    </div>,
    document.body
  );
}
