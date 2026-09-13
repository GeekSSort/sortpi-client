import React from "react";
import Sidebar from "@/components/shared/Sidebar";
import Header from "@/components/shared/Header";
import ShellFrame from "@/components/shared/ShellFrame";
import { SidebarProvider } from "@/components/shared/SidebarContext";

/**
 * The back office's frame: the main menu, the header, and the page under them.
 *
 * Extracted from the (dashboard) layout because the till needs it too. /pos is
 * one address with two frames — a cashier gets PosRail and PosHead, everyone
 * else gets this — and the alternative was a second route for the same screen,
 * which is how /till came to exist and why the address bar disagreed with the
 * menu that had sent you there.
 *
 * The markup itself lives in ShellFrame: the till can hide the menu and the
 * header, and that choice is a per-device one read from localStorage, so the
 * frame has to be assembled in the browser.
 */
export default function DashboardShell({
  children,
  fill = false,
  maximizable = false,
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
  /**
   * Let the page hide the menu and the header (see posMaximized.ts). The till
   * passes it; nothing else should, because every other screen is REACHED
   * through the menu it would be removing.
   */
  maximizable?: boolean;
}) {
  return (
    <SidebarProvider>
      <ShellFrame
        sidebar={<Sidebar />}
        header={<Header />}
        fill={fill}
        maximizable={maximizable}
      >
        {children}
      </ShellFrame>
    </SidebarProvider>
  );
}
