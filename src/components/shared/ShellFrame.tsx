"use client";

import React from "react";
import { usePosMaximized } from "@/components/modules/pos/posMaximized";
import PosMaximizeToggle from "@/components/modules/pos/PosMaximizeToggle";

/**
 * The back office frame's markup, in a client component so the chrome can be
 * taken away without a round trip.
 *
 * DashboardShell stayed a server component and rendered Sidebar and Header
 * itself; the maximize state is per device and lives in localStorage, so the
 * decision has to be made in the browser. The two are passed in as slots
 * rather than imported here, which keeps this file ignorant of what the frame
 * is made of and keeps ONE copy of the layout — the alternative was a second
 * near-identical shell for the till, and the (pos) layout comment already
 * records what happens when the same screen gets two of something.
 */
export default function ShellFrame({
  sidebar,
  header,
  children,
  fill = false,
  maximizable = false,
}: {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
  fill?: boolean;
  /** Only the till asks for this. Everywhere else the frame is not optional. */
  maximizable?: boolean;
}) {
  const maximized = usePosMaximized() && maximizable;

  return (
    <div className="flex h-screen w-screen bg-[#F8F9FA] overflow-hidden">
      {!maximized && sidebar}

      <div
        className={`flex flex-1 flex-col min-w-0 bg-[#F8F9FA] transition-all duration-300 ${
          fill ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {/* Full-bleed: the navbar owns its own 24px gutters (Figma 30:15360). */}
        {!maximized && header}
        {/* flex-1 so a full-height page (the till) can fill what is left
            under the header. Content taller than that still grows the main
            and scrolls the column, exactly as before.

            Maximized, the padding goes too. Keeping the 24px gutter would
            have hidden the frame and then left the hole it sat in. */}
        <main
          className={`w-full flex flex-1 flex-col ${
            maximized ? "gap-[8px] p-[12px]" : "gap-[24px] p-[16px] sm:p-[24px]"
          } ${
            fill ? "min-h-0 overflow-hidden" : ""
          }`}
        >
          {/* Only once maximized: until then the header carries the control,
              beside the column switcher. Its own row rather than floated over
              a corner, because all three of the till's panes scroll inside
              themselves and the bottom-right one is the checkout button — no
              corner is free of something a cashier presses. */}
          {maximized && (
            <div className="flex shrink-0 items-center justify-end">
              <PosMaximizeToggle />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
