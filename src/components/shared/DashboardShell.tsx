import React from "react";
import Sidebar from "@/components/shared/Sidebar";
import Header from "@/components/shared/Header";
import { SidebarProvider } from "@/components/shared/SidebarContext";

/**
 * The back office's frame: the main menu, the header, and the page under them.
 *
 * Extracted from the (dashboard) layout because the till needs it too. /pos is
 * one address with two frames — a cashier gets PosRail and PosHead, everyone
 * else gets this — and the alternative was a second route for the same screen,
 * which is how /till came to exist and why the address bar disagreed with the
 * menu that had sent you there.
 */
export default function DashboardShell({
  children,
  fill = false,
}: {
  children: React.ReactNode;
  /**
   * Pin the page to what is left of the window instead of letting it grow.
   *
   * Off for an ordinary back-office page: those are as tall as their content
   * and the column scrolls. On for the till, which is an app screen whose
   * three panes scroll inside themselves — without it the product wall grew
   * the page, the window scrolled, and the bottom row sat under the fold.
   */
  fill?: boolean;
}) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen bg-[#F8F9FA] overflow-hidden">
        <Sidebar />

        <div
          className={`flex flex-1 flex-col min-w-0 bg-[#F8F9FA] transition-all duration-300 ${
            fill ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {/* Full-bleed: the navbar owns its own 24px gutters (Figma 30:15360). */}
          <Header />
          {/* flex-1 so a full-height page (the till) can fill what is left
              under the header. Content taller than that still grows the main
              and scrolls the column, exactly as before. */}
          <main
            className={`w-full flex flex-1 flex-col p-[16px] gap-[24px] sm:p-[24px] ${
              fill ? "min-h-0 overflow-hidden" : ""
            }`}
          >
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
