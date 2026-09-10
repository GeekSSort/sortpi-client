"use client";

import React from "react";
import {
  NetBalanceIcon,
  TotalExpenseIcon,
  TotalIncomeIcon,
  TotalTransactionsIcon,
} from "./StatIcons";

/**
 * The four cards — Figma 367:2596.
 *
 * Laid out exactly as the dashboard's `MetricCards` (30:15392) is, because the
 * design reuses that component: a 278x143 card at the 1160 width, 24px
 * padding, a 40px gold-ringed icon 16px from a column of label / value / pill
 * 10px apart. The class strings are deliberately the same ones.
 *
 * It is a SEPARATE component rather than a fourth caller of `MetricCards` for
 * two reasons, both in the design. Its pill has no trend arrow — "All time" is
 * a scope, not a movement, and rendering it through the dashboard's
 * `↑ {trend} {vsText}` would print a meaningless arrow beside it. And its
 * icons are four glyphs the dashboard's closed `icon` union does not contain.
 * Widening that union and its pill for one more screen would have changed a
 * component three dashboards already render.
 */

const ICONS = {
  income: TotalIncomeIcon,
  transactions: TotalTransactionsIcon,
  expense: TotalExpenseIcon,
  net: NetBalanceIcon,
} as const;

export interface FinanceStatCard {
  id: keyof typeof ICONS;
  title: string;
  value: string;
  /** The pill's text — "All time", "↑ 8.5% Profitable". */
  note: string;
  /** Red pill for a loss. The design's cards are all green. */
  tone?: "good" | "bad";
}

export default function FinanceStatCards({ cards }: { cards: FinanceStatCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = ICONS[card.id] ?? TotalIncomeIcon;
        const bad = card.tone === "bad";
        return (
          <div
            key={card.id}
            className="flex flex-col items-start overflow-clip rounded-[10px] bg-white p-[20px] text-left shadow-[inset_0_0_0_1px_#eaeaea] sm:p-[24px]"
          >
            <div className="flex w-full items-start gap-[16px]">
              <span className="flex size-[40px] shrink-0 items-center justify-center overflow-clip rounded-[25px] border border-solid border-[#f5b800] bg-white text-[#f5b800]">
                <Icon />
              </span>

              <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-[10px]">
                <p className="w-full text-[14px] leading-[1.5] font-medium tracking-[-0.28px] break-words text-[#525252] uppercase">
                  {card.title}
                </p>
                <p className="w-full text-[20px] leading-[1.5] font-medium tracking-[-0.4px] break-words text-[#262626]">
                  {card.value}
                </p>
                <span
                  className={`flex h-[24px] max-w-full shrink-0 items-center gap-[7px] overflow-clip rounded-[17px] px-[8px] ${
                    bad ? "bg-[#fff5f5]" : "bg-[#f5fff8]"
                  }`}
                >
                  <span
                    className={`size-[6px] shrink-0 rounded-full ${
                      bad ? "bg-[#e5484d]" : "bg-[#00b837]"
                    }`}
                  />
                  <span
                    className={`truncate text-[12px] leading-[16px] font-normal tracking-[-0.24px] ${
                      bad ? "text-[#e5484d]" : "text-[#00b837]"
                    }`}
                  >
                    {card.note}
                  </span>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
