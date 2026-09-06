"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import PlatformSidebar from "@/components/shared/PlatformSidebar";
import { useSession } from "@/services/useSession";

/**
 * The console shell.
 *
 * Same frame as the shop dashboard: a 240px menu beside a column that scrolls
 * under a fixed top bar, on the same #F8F9FA ground. The menu and the titles
 * are the console's own, because it works across companies.
 */

const TITLES: Record<string, { title: string; note: string }> = {
  "/platform": {
    title: "Dashboard",
    note: "What we are earning, who is about to leave, and who just joined.",
  },
  "/platform/companies": {
    title: "Companies",
    note: "Every company on the platform, with its plan, size and status.",
  },
  "/platform/subscriptions": {
    title: "Subscriptions",
    note: "What each company is on, when their period ends, and who is still on trial.",
  },
  "/platform/invoices": {
    title: "Invoices",
    note: "What we billed, what is paid, and what is overdue.",
  },
  "/platform/plans": {
    title: "Plans",
    note: "The plans a company can be on, and the limits each one sets.",
  },
  "/platform/staff": {
    title: "Staff",
    note: "The SORTPoint people who can sign in to this console.",
  },
};

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="block">
      <path d="M2.5 5h15M2.5 10h15M2.5 15h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useSession();

  // The sign-in pages under /platform bring their own layout.
  if (pathname.startsWith("/platform/forgot-password")) return <>{children}</>;

  const page = TITLES[pathname] ?? {
    title: "Console",
    note: "SORTPoint staff only.",
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8F9FA]">
      <PlatformSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[#F8F9FA]">
        <header className="flex w-full items-center justify-between gap-[12px] px-[24px] py-[12px]">
          <div className="flex min-w-0 items-center gap-[12px]">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              className="flex size-[40px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-white text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] lg:hidden"
            >
              <MenuIcon />
            </button>
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-[28px] leading-[1.2] font-semibold tracking-[-0.72px] text-[#f5b800] lg:text-[36px]">
                {page.title}
              </h1>
              <p className="truncate text-[14px] leading-[1.5] text-[#525252]">{page.note}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-[12px]">
            <span className="hidden text-right sm:flex sm:flex-col">
              <span className="text-[14px] font-medium text-[#1e1e1e]">
                {user?.name || "SORTPoint staff"}
              </span>
              <span className="text-[12px] text-[#525252]">Platform console</span>
            </span>
            <span className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-[#1e1e1e] text-[14px] font-semibold text-white">
              {(user?.name || "S").slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>

        <main className="flex w-full flex-col gap-[24px] p-[16px] sm:p-[24px]">{children}</main>
      </div>
    </div>
  );
}
