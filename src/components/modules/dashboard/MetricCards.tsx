"use client";

import React from "react";
import { MetricCardData } from "@/types/dashboard";
import { CustomersIcon, OrdersIcon, RevenueIcon, SalesIcon } from "./MetricIcons";

/**
 * Figma: SortPi — KPI row 30:15392.
 *
 * Each card is 278x143 at the 1160 desktop width: 24px padding, a 40px ringed
 * icon, then a column of label / value / trend pill 10px apart. The row is
 * four equal columns 16px apart; below xl it drops to two, then one.
 */

interface MetricCardsProps {
  metrics: MetricCardData[];
  onCardClick?: (id: string) => void;
}

const ICONS = {
  revenue: RevenueIcon,
  sales: SalesIcon,
  orders: OrdersIcon,
  customers: CustomersIcon,
} as const;

export default function MetricCards({ metrics, onCardClick }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((item) => {
        const Icon = ICONS[item.icon] ?? RevenueIcon;
        const down = item.trendType === "down";

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onCardClick?.(item.id)}
            className="flex cursor-pointer flex-col items-start overflow-clip rounded-[10px] bg-white p-[24px] text-left shadow-[inset_0_0_0_1px_#eaeaea] transition-shadow duration-200 ease-out hover:shadow-[inset_0_0_0_1px_#f5b800]"
          >
            <div className="flex w-full items-start gap-[16px]">
              {/* Icons — 40px ring, 24px glyph (30:15395) */}
              <span className="flex size-[40px] shrink-0 items-center justify-center overflow-clip rounded-[25px] border border-solid border-[#f5b800] bg-white text-[#f5b800]">
                <Icon />
              </span>

              {/* Name — label / value / trend, 10px apart (30:15406) */}
              <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-[10px]">
                <p className="w-full text-[14px] leading-[1.5] font-medium tracking-[-0.28px] break-words text-[#525252] uppercase">
                  {item.title}
                </p>
                <p className="w-full text-[20px] leading-[1.5] font-medium tracking-[-0.4px] break-words text-[#262626]">
                  {item.value}
                </p>
                <span
                  className={`flex h-[24px] max-w-full shrink-0 items-center gap-[7px] overflow-clip rounded-[17px] px-[8px] ${
                    down ? "bg-[#fff5f5]" : "bg-[#f5fff8]"
                  }`}
                >
                  <span
                    className={`size-[6px] shrink-0 rounded-full ${
                      down ? "bg-[#e5484d]" : "bg-[#00b837]"
                    }`}
                  />
                  <span
                    className={`truncate text-[12px] leading-[16px] font-normal tracking-[-0.24px] ${
                      down ? "text-[#e5484d]" : "text-[#00b837]"
                    }`}
                  >
                    {down ? "↓" : "↑"} {item.trend} {item.vsText}
                  </span>
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
