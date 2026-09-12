"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AuthService } from "@/services";
import { clearSessionCache, useSession } from "@/services/useSession";

import { canOpenPage } from "@/lib/pageAccess";

import BranchSwitcher from "./BranchSwitcher";
import { useSidebar } from "./SidebarContext";
import {
  CaretIcon,
  CustomersIcon,
  DashboardIcon,
  DiscountIcon,
  FinanceIcon,
  HrmIcon,
  InventoryIcon,
  LogOutIcon,
  PosIcon,
  PurchasesIcon,
  ReportsIcon,
  ReturnsIcon,
  RolesIcon,
  SalesPosIcon,
  SettingsIcon,
} from "./SidebarIcons";

/**
 * The sidebar — Figma 20:7588, and 31:17154 with a section open.
 *
 * 240px wide: 16px padding around a 208px column. Rows are 37px, the selected
 * row is 41px on white, and an open section becomes a gold card holding its
 * sub-menu.
 */

type SubItem = { name: string; href: string; match: (p: string) => boolean };

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType;
  match: (p: string) => boolean;
  children?: SubItem[];
};

const NAV: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: DashboardIcon,
    match: (p) => p === "/" || p === "/dashboard",
  },
  // The till is a page here, not an environment to switch into. Anyone
  // reading this menu has `dashboard.view`, so the back office is their home
  // and /pos would take the whole window away from them. A cashier never sees
  // this menu — they get PosRail, in the till's own shell.
  {
    name: "POS",
    href: "/pos",
    icon: PosIcon,
    // The till only. Everything else under /pos has a back-office address of
    // its own, and the guard sends this reader to it.
    match: (p) => p === "/pos",
  },
  // Two menu entries, not one with a drawer. They are read at different times
  // by different people — a shopkeeper checking today's takings is not the
  // person processing a refund — and nesting them meant reaching either one
  // opened a submenu naming the other.
  {
    name: "Invoices",
    href: "/sales-pos/sales",
    icon: SalesPosIcon,
    match: (p) => p.startsWith("/sales-pos/sales"),
  },
  {
    name: "Returns and Refunds",
    href: "/sales-pos/return",
    icon: ReturnsIcon,
    match: (p) => p.startsWith("/sales-pos/return"),
  },
  {
    name: "Customers",
    href: "/customers",
    icon: CustomersIcon,
    match: (p) => p.startsWith("/customers"),
  },
  {
    name: "Inventory",
    href: "/inventory",
    icon: InventoryIcon,
    match: (p) => p.startsWith("/inventory"),
    children: [
      {
        name: "Products",
        href: "/inventory",
        match: (p) => p === "/inventory" || p.startsWith("/inventory/add") || p.startsWith("/inventory/products"),
      },
      { name: "Stocks", href: "/inventory/stock", match: (p) => p.startsWith("/inventory/stock") },
      {
        name: "Transfers",
        href: "/inventory/transfers",
        match: (p) => p.startsWith("/inventory/transfers"),
      },
    ],
  },
  {
    name: "Purchases",
    href: "/purchases",
    icon: PurchasesIcon,
    match: (p) => p.startsWith("/purchases"),
    children: [
      {
        name: "Purchase History",
        href: "/purchases",
        match: (p) => p === "/purchases" || p.startsWith("/purchases/history"),
      },
      {
        name: "Suppliers",
        href: "/purchases/suppliers",
        match: (p) => p.startsWith("/purchases/suppliers"),
      },
    ],
  },
  {
    // Figma 369:5812 — Finance sits directly after Purchases, and its two
    // children are the shop's own books: what came in and what went out, and
    // the vouchers behind them.
    name: "Finance",
    href: "/finance/income-expense",
    icon: FinanceIcon,
    match: (p) => p.startsWith("/finance"),
    children: [
      {
        name: "Income & Expense",
        href: "/finance/income-expense",
        match: (p) => p.startsWith("/finance/income-expense"),
      },
      {
        // The Figma group's second child (369:5812), built now. It reads the
        // same two tables as the row above — a voucher IS an income or an
        // expense — so the two screens can never disagree about a figure.
        name: "Vouchers",
        href: "/finance/vouchers",
        match: (p) => p.startsWith("/finance/vouchers"),
      },
      {
        // The money that has NOT happened yet — schedules, not documents.
        // Paying one writes a voucher, so it sits directly under that row.
        name: "Regular Payments",
        href: "/finance/regular-payments",
        match: (p) => p.startsWith("/finance/regular-payments"),
      },
    ],
  },
  { name: "Reports", href: "/reports", icon: ReportsIcon, match: (p) => p.startsWith("/reports") },
  { name: "Discount", href: "/discount", icon: DiscountIcon, match: (p) => p.startsWith("/discount") },
  {
    // Three separate jobs that were sharing one screen: who works here, who
    // turned up today, and what they were paid. The roster and the attendance
    // sheet in particular were one table — an employee list with Check In and
    // Present/Absent columns — so neither question could be answered without
    // reading around the other.
    name: "HRM",
    href: "/hrm",
    icon: HrmIcon,
    match: (p) => p.startsWith("/hrm"),
    children: [
      {
        name: "Employees",
        href: "/hrm",
        match: (p) => p === "/hrm" || p.startsWith("/hrm/add"),
      },
      {
        name: "Attendance",
        href: "/hrm/attendance",
        match: (p) => p.startsWith("/hrm/attendance"),
      },
      {
        name: "Payroll",
        href: "/hrm/payroll",
        match: (p) => p.startsWith("/hrm/payroll"),
      },
    ],
  },
  {
    name: "Roles & Permissions",
    href: "/roles-permissions",
    icon: RolesIcon,
    match: (p) => p.startsWith("/roles-permissions"),
  },
  { name: "Settings", href: "/settings", icon: SettingsIcon, match: (p) => p.startsWith("/settings") },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, setIsCollapsed } = useSidebar();

  // A section is open when the current page is inside it, and clicking the row
  // toggles it.
  //
  // Read once at mount this went stale: the sidebar lives in the layout and
  // never remounts, so moving between sections left the wrong one open.
  // Setting it during render keeps it in step.
  const { user: session, loading: sessionLoading } = useSession();
  const router = useRouter();

  /**
   * Only the destinations this account can actually open.
   *
   * The menu used to list all thirteen to everybody who reached it, so an
   * Accountant saw HRM, Roles & Permissions and Settings and was refused by
   * each. Hiding a row is NOT the control — the API refuses these regardless,
   * which is where authorization belongs — but a menu that offers what it
   * cannot open is a menu nobody trusts, and it is how somebody concludes the
   * product is broken rather than that they lack a permission.
   *
   * Sub-items are filtered on their own codes, and a section whose children
   * all disappear goes with them. A destination with no entry in the map is
   * shown, so an unlisted page is visible rather than silently dropped.
   */
  const permissions = session?.permissions;
  const nav = React.useMemo(() => {
    // Unfiltered until the session lands. `useSession` starts at null, and
    // filtering on an empty permission list would paint an EMPTY sidebar for
    // the first frame and then fill it in — a worse artefact than briefly
    // showing a row the account cannot open, which the API refuses anyway.
    if (sessionLoading || !permissions) return NAV;
    return NAV.map((item) => {
      const children = item.children?.filter((child) => canOpenPage(child.href, permissions));
      return { ...item, children };
    }).filter((item) => {
      if (item.children && item.children.length > 0) return true;
      if (item.children && item.children.length === 0) return false;
      return canOpenPage(item.href, permissions);
    });
  }, [permissions, sessionLoading]);

  /**
   * A branch switch changes the answer to every request on the page.
   *
   * Same handling as the header's copy, and for the same reason: the token is
   * new, the permissions in it are new, and every list on screen was fetched
   * under the old one. `router.refresh()` would not do it — these are client
   * pages that fetch in effects, and nothing would re-run.
   */
  const onBranchSwitched = React.useCallback(() => {
    clearSessionCache();
    window.location.reload();
  }, []);

  const routeSection = nav.find((i) => i.children && i.match(pathname))?.name ?? null;
  const [openSection, setOpenSection] = useState<string | null>(routeSection);
  const [lastRoute, setLastRoute] = useState<string | null>(routeSection);

  if (routeSection !== lastRoute) {
    setLastRoute(routeSection);
    if (routeSection) setOpenSection(routeSection);
  }

  return (
    <>
      {/* Drawer scrim — only below lg, where the rail overlays the page. */}
      <div
        onClick={() => setIsCollapsed(true)}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden ${
          isCollapsed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      />
      {/* Drawer below lg, in-flow rail from lg up. The lg: utilities win over the
          collapsed state, so the rail is always open on desktop and always shut
          on first paint below it — no media query in JS, so no hydration flash. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[240px] shrink-0 bg-[#eaeaea] px-[16px] py-[20px] transition-transform duration-300 ease-in-out select-none lg:static lg:z-40 lg:translate-x-0 ${
          isCollapsed ? "-translate-x-full" : "translate-x-0"
        }`}
      >
      <div className="flex h-full w-[208px] flex-col justify-between">
        {/* Top: the logo, the branch cursor on a phone, and the menu.

            The MENU is what scrolls, not this group. Eleven rows, the logo and
            the footer want about 740px; a phone in landscape has 375 and an
            iPhone SE in portrait has 667, so the bottom of the menu used to be
            CLIPPED by the aside's `overflow-hidden` with no way to reach it —
            Settings, Log Out and the profile simply were not there. Opening a
            section, which adds three more rows, cut it further.

            Scrolling the nav alone rather than this whole group matters twice
            over: the branch cursor stays put while you look down the menu, and
            its dropdown is not inside a scroll container — an `overflow` box
            clips absolutely-positioned children, so anchoring it here would
            have cut the branch list off at the menu's edge. */}
        <div className="flex w-full min-h-0 flex-1 flex-col items-center gap-[24px]">
          <Link href="/dashboard" className="block h-[54px] w-[208px] shrink-0">
            <Image
              src="/sidebar/logo.png"
              alt="SortPi — Smart POS · Simply Business"
              width={208}
              height={54}
              priority
              className="h-[54px] w-[208px] object-contain"
            />
          </Link>

          {/* The branch cursor, on a phone.

              It is in the header from md up, where there is room for it. Below
              that the header carries the title, the bell and the avatar and
              nothing else, so it lives here — directly above the menu it
              re-scopes, which is the right place to read it: every destination
              under it answers for the branch named here.

              Only one of the two is ever mounted for real. This copy is
              `md:hidden` and the header's is `hidden md:flex`, and a hidden
              ancestor takes the dropdown and the Add-branch dialog with it, so
              they cannot both be open. */}
          <div className="w-[208px] shrink-0 md:hidden">
            <BranchSwitcher onChange={onBranchSwitched} />
          </div>

          {/* Still scrolls; the bar itself is hidden.
              `no-scrollbar` is the utility the POS category row already uses —
              the menu is a short, familiar list and a permanent grey track
              down the side of it reads as a seam in the chrome rather than as
              a control anybody uses. */}
          <nav className="no-scrollbar flex w-[208px] min-h-0 flex-1 flex-col gap-[8px] overflow-x-hidden overflow-y-auto">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);

              // Section row, closed 20:7600 and open 31:17169. One element for
              // both, so the colour, arrow and sub-menu animate instead of
              // swapping. 0fr -> 1fr grows to the sub-menu's own height with no
              // measuring.
              if (item.children) {
                const isOpen = openSection === item.name;
                return (
                  <div
                    key={item.name}
                    className={`w-[208px] rounded-[6px] px-[10px] py-[8px] transition-colors duration-300 ease-out ${
                      isOpen ? "bg-[#f5b800]" : "bg-transparent hover:bg-white/40"
                    }`}
                  >
                    <div className="flex gap-[14px]">
                      <span
                        className={`flex h-[21px] shrink-0 transition-colors duration-300 ease-out ${
                          isOpen ? "items-start text-white" : "items-center text-[#525252]"
                        }`}
                      >
                        <Icon />
                      </span>

                      <div className="flex w-[154px] flex-col">
                        <button
                          type="button"
                          onClick={() => setOpenSection(isOpen ? null : item.name)}
                          aria-expanded={isOpen}
                          className="flex h-[21px] w-full cursor-pointer items-center gap-[8px]"
                        >
                          <span
                            className={`text-[14px] leading-[21px] tracking-[-0.28px] whitespace-nowrap transition-[color,font-weight] duration-300 ease-out ${
                              isOpen ? "font-semibold text-white" : "font-normal text-[#525252]"
                            }`}
                          >
                            {item.name}
                          </span>
                          {/* 8x4 caret: upright when open, quarter-turned left when closed */}
                          <span
                            className={`flex items-center justify-center transition-[width,height,color] duration-300 ease-out ${
                              isOpen ? "h-[4px] w-[8px] text-white" : "h-[8px] w-[4px] text-[#525252]"
                            }`}
                          >
                            <span
                              className={`block transition-transform duration-300 ease-out ${
                                isOpen ? "rotate-0" : "-rotate-90"
                              }`}
                            >
                              <CaretIcon />
                            </span>
                          </span>
                        </button>

                        <div
                          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                            isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div
                              className={`flex flex-col gap-[4px] pt-[4px] transition-opacity duration-300 ease-out ${
                                isOpen ? "opacity-100" : "opacity-0"
                              }`}
                              inert={!isOpen}
                            >
                              {item.children.map((sub) => {
                                const subActive = sub.match(pathname);
                                return (
                                  <Link
                                    key={sub.name}
                                    href={sub.href}
                                    className={`flex h-[26px] w-full items-center rounded-[5px] px-[12px] transition-colors duration-200 ease-out ${
                                      subActive
                                        ? "bg-white"
                                        : "border border-solid border-white hover:bg-white/15"
                                    }`}
                                  >
                                    <span
                                      className={`text-[12px] leading-[14px] font-medium tracking-[-0.24px] whitespace-nowrap ${
                                        subActive ? "text-[#f5b800]" : "text-white"
                                      }`}
                                    >
                                      {sub.name}
                                    </span>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // A plain row: 41px white card when selected (20:7596), 37px
              // otherwise (26:9567).
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`transition-colors duration-200 ease-out ${
                    active
                      ? "flex w-full flex-col items-center justify-center rounded-[8px] bg-white p-[10px]"
                      : "flex w-[208px] items-center rounded-[6px] px-[10px] py-[8px] hover:bg-white/40"
                  }`}
                >
                  <span className={`flex w-full items-center ${active ? "gap-[13px]" : "gap-[14px]"}`}>
                    <span className={active ? "text-[#f5b800]" : "text-[#525252]"}>
                      <Icon />
                    </span>
                    <span
                      className={`text-[14px] tracking-[-0.28px] whitespace-nowrap ${
                        active
                          ? "leading-[1.5] font-semibold text-[#f5b800]"
                          : "leading-[21px] font-normal text-[#525252]"
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

        {/* Bottom: log out, divider, profile — 12px apart. `shrink-0` so the
            scrolling menu above can never eat into it. */}
        <div className="flex w-full shrink-0 flex-col gap-[12px] pt-[12px]">
          <button
            type="button"
            onClick={async () => {
              // This used to be a plain redirect. The tokens stayed, so the
              // guard let you straight back in.
              await AuthService.logout();
              clearSessionCache();
              router.replace("/login");
            }}
            className="flex h-[50px] w-full cursor-pointer flex-col items-start justify-center rounded-[10px] border border-solid border-[#525252] px-[12px]"
          >
            <span className="flex h-[20px] w-full items-center justify-between">
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
              <span className="flex h-[18px] flex-col justify-center truncate text-[16px] leading-[1.5] font-medium tracking-[-0.32px]">
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
    </>
  );
}
