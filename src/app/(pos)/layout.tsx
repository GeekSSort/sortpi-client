import React from "react";
import { cookies } from "next/headers";
import PosRail from "@/components/modules/pos/PosRail";
import PosHead from "@/components/modules/pos/PosHead";
import DashboardShell from "@/components/shared/DashboardShell";

/**
 * The till environment — Figma 247:13582.
 *
 * One address, two frames. A cashier gets the till's own menu and head, and it
 * owns the whole window: nothing from the back office appears, and there is no
 * SidebarProvider, which belongs to the dashboard's drawer.
 *
 * Anyone with a back office gets the back office's frame instead, with the
 * till as a page inside it — they reach it from POS in their own menu, and a
 * menu that sends you somewhere your menu disappears is a trapdoor.
 *
 * The choice is made from the `sp_scope` cookie, on the server, for the reason
 * the route guard reads the same cookie: the session is fetched by the browser
 * and picking the frame from it would paint one shell and then swap it.
 */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const posOnly = (await cookies()).get("sp_scope")?.value === "pos";

  if (!posOnly) return <DashboardShell fill>{children}</DashboardShell>;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <PosRail />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <PosHead />
        {/* A flex column, like the dashboard's main. The till fills it with
            flex-1 either way, so the same page works in both shells. */}
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto py-[24px] pr-[16px] pl-[24px]">
          {children}
        </main>
      </div>
    </div>
  );
}
