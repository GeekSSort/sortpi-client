import React from "react";
import PosRail from "@/components/modules/pos/PosRail";
import PosHead from "@/components/modules/pos/PosHead";

/**
 * The till environment — Figma 247:13582.
 *
 * Beside (dashboard), not inside it: the till owns the whole window. A 240px
 * menu next to a white column that scrolls under a fixed head.
 *
 * It has its own menu and head so nothing from the back office appears here,
 * and no SidebarProvider, which belongs to the dashboard's drawer.
 */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <PosRail />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <PosHead />
        <main className="min-h-0 w-full flex-1 overflow-hidden py-[24px] pr-[16px] pl-[24px]">
          {children}
        </main>
      </div>
    </div>
  );
}
