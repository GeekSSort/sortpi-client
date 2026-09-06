"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AuthService } from "@/services";
import { clearSessionCache, useSession } from "@/services/useSession";
import {
  CaretIcon,
  CustomersIcon,
  DiscountIcon,
  LogOutIcon,
  ProductsIcon,
  ReportsIcon,
  SalesPosIcon,
  SettingsIcon,
} from "@/components/shared/SidebarIcons";

/**
 * The till's side menu — Figma 247:13583.
 *
 * 240 wide on #eaeaea: a 208x54 logo, then the menu 32px below with 8px
 * between rows. The selected row is 41 tall, gold, white semibold text.
 *
 * Six entries, not the main app's nine: a cashier only needs what they touch.
 */

type SubItem = { name: string; href: string; match: (p: string) => boolean };

type Item = {
  name: string;
  href: string;
  icon: React.ComponentType;
  match: (p: string) => boolean;
  children?: SubItem[];
};

const NAV: Item[] = [
  {
    name: "Sales & POS",
    href: "/pos",
    icon: SalesPosIcon,
    match: (p) => p === "/pos" || p.startsWith("/pos/sales") || p.startsWith("/pos/return"),
    children: [
      { name: "POS", href: "/pos", match: (p) => p === "/pos" },
      { name: "Sales", href: "/pos/sales", match: (p) => p.startsWith("/pos/sales") },
      { name: "Return", href: "/pos/return", match: (p) => p.startsWith("/pos/return") },
    ],
  },
  {
    name: "Customers",
    href: "/pos/customers",
    icon: CustomersIcon,
    match: (p) => p.startsWith("/pos/customers"),
  },
  {
    name: "Products",
    href: "/pos/products",
    icon: ProductsIcon,
    match: (p) => p.startsWith("/pos/products"),
  },
  {
    name: "Reports",
    href: "/pos/reports",
    icon: ReportsIcon,
    match: (p) => p.startsWith("/pos/reports"),
  },
  {
    name: "Discount",
    href: "/pos/discount",
    icon: DiscountIcon,
    match: (p) => p.startsWith("/pos/discount"),
  },
  {
    name: "Settings",
    href: "/pos/settings",
    icon: SettingsIcon,
    match: (p) => p.startsWith("/pos/settings"),
  },
];

export default function PosRail() {
  const pathname = usePathname();

  const { user: session } = useSession();
  const router = useRouter();

  // The group the current page belongs to, if any.
  const routeSection = NAV.find((i) => i.children && i.match(pathname))?.name ?? null;

  // The group the user last opened. Starts from the route, then stays put.
  const [openSection, setOpenSection] = useState<string | null>(routeSection);
  const [lastRoute, setLastRoute] = useState<string | null>(routeSection);

  // Set during render, not in an effect: this is React's own advice for state
  // that follows a prop, and it avoids a second paint.
  //
  // It fixes a real bug. The menu read the route once, when it mounted, and
  // the menu never remounts — so moving from Sell to Products closed the
  // group with no way to reopen it short of a reload.
  if (routeSection !== lastRoute) {
    setLastRoute(routeSection);
    if (routeSection) setOpenSection(routeSection);
  }

  return (
    <aside className="hidden h-full w-[240px] shrink-0 items-center justify-center bg-[#eaeaea] px-[16px] py-[20px] select-none lg:flex">
      <div className="flex h-full w-[208px] flex-col items-start justify-between">
        <div className="flex w-full flex-col items-center gap-[32px]">
          {/* image 5 — 208x54 */}
          <Link href="/pos" className="block h-[54px] w-[208px] shrink-0">
            <Image
              src="/sidebar/logo.png"
              alt="SortPoint"
              width={208}
              height={54}
              priority
              className="h-[54px] w-[208px] object-contain object-left"
            />
          </Link>

          <nav className="flex w-[208px] flex-col gap-[8px]">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);

              if (item.children) {
                const isOpen = openSection === item.name;
                return (
                  <div
                    key={item.name}
                    className={`w-[208px] rounded-[6px] px-[10px] py-[8px] transition-colors duration-300 ease-out ${
                      isOpen ? "bg-[#f5b800]" : "bg-transparent hover:bg-white/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenSection(isOpen ? null : item.name)}
                      aria-expanded={isOpen}
                      className="flex w-full cursor-pointer items-center gap-[14px]"
                    >
                      <span
                        className={`flex h-[21px] shrink-0 items-center transition-colors duration-300 ease-out ${
                          isOpen ? "text-white" : "text-[#525252]"
                        }`}
                      >
                        <Icon />
                      </span>
                      <span className="flex h-[21px] items-center gap-[8px]">
                        <span
                          className={`text-[14px] leading-[21px] tracking-[-0.28px] whitespace-nowrap transition-colors duration-300 ease-out ${
                            isOpen ? "font-semibold text-white" : "font-normal text-[#525252]"
                          }`}
                        >
                          {item.name}
                        </span>
                        <span
                          className={`flex h-[8px] w-[4px] items-center justify-center transition-[transform,color] duration-300 ease-out ${
                            isOpen ? "rotate-0 text-white" : "-rotate-90 text-[#525252]"
                          }`}
                        >
                          <CaretIcon />
                        </span>
                      </span>
                    </button>

                    {/* 0fr -> 1fr grows to the sub-menu's own height, so it can
                        animate without anyone measuring it. */}
                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-[8px] flex w-[154px] flex-col gap-[6px] pl-[34px]">
                          {item.children.map((sub) => {
                            const on = sub.match(pathname);
                            return (
                              <Link
                                key={sub.name}
                                href={sub.href}
                                className={`flex h-[29px] items-center rounded-[6px] border border-solid border-white px-[10px] text-[14px] leading-[21px] tracking-[-0.28px] whitespace-nowrap transition-colors ${
                                  on
                                    ? "bg-white font-medium text-[#f5b800]"
                                    : "font-normal text-white hover:bg-white/20"
                                }`}
                              >
                                {sub.name}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex w-[208px] items-center rounded-[6px] px-[10px] py-[8px] transition-colors ${
                    active ? "h-[41px] bg-[#f5b800]" : "hover:bg-white/40"
                  }`}
                >
                  <span className="flex items-center gap-[14px]">
                    <span className={`flex h-[21px] items-center ${active ? "text-white" : "text-[#525252]"}`}>
                      <Icon />
                    </span>
                    <span
                      className={`text-[14px] leading-[21px] tracking-[-0.28px] whitespace-nowrap ${
                        active ? "font-semibold text-white" : "font-normal text-[#525252]"
                      }`}
                    >
                      {item.name}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Log out, rule, profile — 12px apart (247:13642) */}
        <div className="flex w-full flex-col gap-[12px]">
          <button
            type="button"
            onClick={async () => {
              // This used to be a link to /dashboard: it said Log Out and did not.
              await AuthService.logout();
              clearSessionCache();
              router.replace("/login");
            }}
            className="flex w-full cursor-pointer flex-col items-start justify-center rounded-[10px] border border-solid border-[#525252] px-[12px] py-[15px]"
          >
            <span className="flex w-full items-center justify-between">
              <span className="text-[14px] leading-[1.4] font-medium whitespace-nowrap text-[#525252]">
                Log Out
              </span>
              <span className="text-[#525252]">
                <LogOutIcon />
              </span>
            </span>
          </button>

          <div className="h-px w-[208px] bg-[#525252]" />

          <div className="flex h-[48px] w-full items-center gap-[8px] rounded-[10px] py-[16px] pl-[10px]">
            <Image
              src={session?.avatar || "/sidebar/avatar.png"}
              alt=""
              width={32}
              height={32}
              className="size-[32px] shrink-0 rounded-full object-cover"
            />
            <div className="flex w-[151px] flex-col text-[#525252]">
              <span className="flex h-[18px] flex-col justify-center text-[16px] leading-[1.5] font-medium tracking-[-0.32px]">
                {session?.name || "—"}
              </span>
              <span className="flex h-[18px] flex-col justify-center truncate text-[12px] leading-normal font-normal tracking-[-0.12px]">
                {session?.email || ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
