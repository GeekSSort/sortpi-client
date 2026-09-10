"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, queryKey, setQueryData } from "@/lib/query/useQuery";

import { AuthService, NotificationService } from "@/services";
import { useSession, clearSessionCache } from "@/services/useSession";
import BranchSwitcher from "./BranchSwitcher";
import {
  UpgradeBarButton,
  UpgradeDialog,
  UpgradeMenuItem,
  UpgradePlanChip,
} from "./UpgradeButton";
import PosViewToggle from "@/components/modules/pos/PosViewToggle";
import { NotificationItem } from "@/types/notifications";
import { useSidebar } from "./SidebarContext";
import { ListSkeleton } from "./Skeleton";

/**
 * The top bar — Figma 30:15360.
 *
 * A gold title on the left, notifications and the avatar on the right. Its
 * 67px height comes from the title's line height, not a fixed number.
 *
 * Below lg it gains a menu button for the slide-out sidebar and the title gets
 * smaller. There is no Figma frame for that; it is our choice.
 */

/** Bell and its badge, node 30:15365. */
function BellIcon() {
  return (
    <svg
      className="block size-[20px] shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8.33328 20C9.84254 20 11.105 18.9241 11.395 17.5H5.2716C5.56168 18.9241 6.82418 20 8.33328 20ZM14.6466 12.0799C14.6249 12.0799 14.605 12.0833 14.5833 12.0833C10.9074 12.0833 7.91672 9.09258 7.91672 5.41672C7.91672 3.97246 8.38332 2.6384 9.16672 1.54496V0.833281C9.16672 0.372461 8.79332 0 8.33328 0C7.8734 0 7.5 0.372461 7.5 0.833281V1.7334C4.67742 2.14004 2.5 4.56758 2.5 7.5V9.82332C2.5 11.4725 1.7775 13.0292 0.509961 14.1008C0.349953 14.2375 0.221503 14.4074 0.133464 14.5986C0.045425 14.7898 -0.000109074 14.9978 1.96202e-07 15.2083C1.96202e-07 16.0126 0.654141 16.6667 1.45828 16.6667H15.2083C16.0126 16.6667 16.6667 16.0126 16.6667 15.2083C16.6667 14.7816 16.4809 14.3784 16.1484 14.0942C15.4916 13.5384 14.9851 12.8467 14.6466 12.0799Z"
        fill="currentColor"
      />
      <path
        d="M14.5833 0C11.5967 0 9.16672 2.42996 9.16672 5.41672C9.16672 8.40332 11.5967 10.8333 14.5833 10.8333C17.57 10.8333 20 8.40332 20 5.41672C20 2.42996 17.57 0 14.5833 0ZM15.4167 7.29172C15.4167 7.63672 15.1367 7.91672 14.7917 7.91672C14.4467 7.91672 14.1667 7.63672 14.1667 7.29172V4.58328H13.75C13.405 4.58328 13.125 4.30328 13.125 3.95828C13.125 3.61328 13.405 3.33328 13.75 3.33328H14.7917C15.1367 3.33328 15.4167 3.61328 15.4167 3.95828V7.29172Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      className="block size-[20px] shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M2.5 5H17.5M2.5 10H17.5M2.5 15H17.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Which line sits under the title, for each page. */
function subtitleForPath(pathname: string): string | null {
  if (pathname === "/pos") return "Ring up a sale, take payment, and print the receipt.";
  if (pathname.startsWith("/reports")) return "Sales, payments and stock movement over a period you choose.";
  if (pathname.startsWith("/discount")) return "Create and manage discounts, offers and coupon codes.";
  if (pathname.startsWith("/sales-pos/sales")) return "View & manage all sales, invoice or order";
  if (pathname.startsWith("/sales-pos/return/new"))
    return "Find the sale, choose what came back, and refund it.";
  if (pathname.startsWith("/sales-pos/return")) return "View & manage all returns and refunds";
  if (pathname.startsWith("/customers")) return "Manage all customers, transactions, and outstanding balances.";
  if (pathname.startsWith("/inventory/add"))
    return "Add a new product to your inventory with pricing, stock, and product information.";
  if (pathname.startsWith("/inventory/stock/add")) return "Add new stock to your inventory.";
  if (pathname.startsWith("/inventory/stock"))
    return "Track current inventory levels across all branches and warehouses.";
  if (pathname.startsWith("/inventory/transfers/add"))
    return "Draft a transfer: where it comes from, where it goes, and what is on it.";
  if (pathname.startsWith("/inventory/transfers"))
    return "Manage and track product transfers between branches or warehouses.";
  if (pathname === "/purchases" || pathname.startsWith("/purchases/history"))
    return "Track, review, and manage all purchase transactions in one place.";
  if (pathname.startsWith("/purchases/suppliers/add"))
    return "Add a new supplier and manage their business, contact, and payment information.";
  if (pathname.startsWith("/purchases/suppliers"))
    return "Manage suppliers, purchase history, outstanding balances, and contact information from one place.";
  if (pathname.startsWith("/roles-permissions/add"))
    return "Create a new user account and assign their role, branch, and system access.";
  if (pathname.startsWith("/roles-permissions"))
    return "Manage system users, roles, branch access, and account status.";
  // Longest path FIRST. These are prefix tests in order, so a bare `/hrm`
  // above them answers for `/hrm/attendance` too — which is how the roster's
  // old "attendance, check-in/out" line survived onto a page that no longer
  // shows either. The `/hrm` and `/hrm/add` arms were also each written twice,
  // and only the first of each was ever reached.
  if (pathname.startsWith("/hrm/payroll"))
    return "Manage employee salaries, allowances, deductions, attendance, overtime, and payment status from one place.";
  if (pathname.startsWith("/hrm/attendance"))
    return "Who turned up, when they checked in and out, for a day you choose.";
  if (pathname.startsWith("/hrm/add"))
    return "Add a new employee with their department, designation, and contact information.";
  if (pathname.startsWith("/hrm"))
    return "Everybody who works here — department, designation, contact and joining date.";
  if (pathname === "/inventory")
    return "Manage, organize, and monitor all products across your inventory.";
  if (pathname.startsWith("/finance/income-expense"))
    return "What the shop took and what it spent, month by month.";
  return null;
}

/** The title for each page, using the sidebar's own names. */
function titleForPath(pathname: string): string {
  if (pathname === "/pos") return "POS";
  if (pathname.startsWith("/sales-pos/sales")) return "Sales";
  if (pathname.startsWith("/sales-pos/return/new")) return "New Return";
  if (pathname.startsWith("/sales-pos/return")) return "Returns";

  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/inventory/stock/add")) return "Add Stock";
  if (pathname.startsWith("/inventory/stock")) return "Stocks";
  if (pathname.startsWith("/inventory/transfers/add")) return "Add Transfer";
  if (pathname.startsWith("/inventory/transfers")) return "Transfers";
  if (pathname.startsWith("/inventory/add")) return "Add New Product";
  if (pathname.startsWith("/inventory")) return "Products";
  if (pathname.startsWith("/purchases/suppliers/add")) return "Add Supplier";
  if (pathname.startsWith("/purchases/suppliers")) return "Suppliers";
  if (pathname.startsWith("/purchases")) return "Purchase History";
  if (pathname.startsWith("/hrm/payroll")) return "Payroll";
  if (pathname.startsWith("/hrm/attendance")) return "Attendance";
  if (pathname.startsWith("/hrm/add")) return "Add Employees";
  if (pathname.startsWith("/hrm")) return "Employees";
  if (pathname.startsWith("/roles-permissions/add")) return "Add User";
  if (pathname.startsWith("/roles-permissions")) return "User List";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/discount")) return "Discount";
  if (pathname.startsWith("/ceo-overview")) return "CEO Overview";
  if (pathname.startsWith("/finance/income-expense")) return "Income & Expense";
  return "Dashboard";
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export interface HeaderProps {
  /** Use this title instead of the page's own. */
  title?: string;
  /** Use this line instead of the page's own. null hides it. */
  subtitle?: string | null;
  /** Shown in the profile menu. */
  user?: { name: string; email: string; avatar?: string };
}

export default function Header({ title, subtitle, user }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  const { user: session } = useSession();
  const [open, setOpen] = useState<"bell" | "profile" | null>(null);
  /**
   * The plan dialog is owned HERE, not by whichever button opened it.
   *
   * It used to live inside the account dropdown on a phone, and opening it
   * closed the dropdown — which unmounted the dialog along with it, so the
   * button did nothing at all. One dialog, mounted outside everything that can
   * disappear, opened by either trigger.
   */
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const [bellLoading, setBellLoading] = useState(false);
  const [bellError, setBellError] = useState(false);

  /**
   * The badge is cached like everything else, so moving between screens does
   * not re-ask on every mount — the header remounts on each navigation, and
   * that was one request per page view for a number that changes rarely.
   *
   * A minute is short enough that a stock alert raised elsewhere shows up
   * without a reload, and long enough that walking around the app is free.
   * `markRead` below writes the new count straight into the same cache entry,
   * so the badge clears the instant the panel opens rather than a round trip
   * later.
   */
  const { data: unreadCount } = useQuery(
    queryKey("notifications-unread"),
    () => NotificationService.unreadCount(),
    { staleMs: 60_000 }
  );
  const unread = unreadCount ?? 0;

  const heading = title ?? titleForPath(pathname);
  const sub = subtitle !== undefined ? subtitle : subtitleForPath(pathname);
  // The signed-in account, unless the caller passed one in.
  const profile = user ?? {
    name: session?.name ?? "",
    email: session?.email ?? "",
    avatar: session?.avatar || "/sidebar/nav-avatar.png",
  };

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openBell = useCallback(async () => {
    if (open === "bell") return setOpen(null);
    setOpen("bell");
    setBellError(false);
    setBellLoading(true);
    try {
      const list = await NotificationService.list();
      setItems(list);
      const unreadIds = list.filter((n) => !n.isRead).map((n) => n.id);
      if (unreadIds.length) {
        await NotificationService.markRead(unreadIds);
        setQueryData(queryKey("notifications-unread"), 0);
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch {
      // The panel is open and empty either way; without this it read as "no
      // notifications", which is a different and reassuring claim.
      setBellError(true);
    } finally {
      setBellLoading(false);
    }
  }, [open]);

  const logout = async () => {
    await AuthService.logout();
    router.push("/login");
  };

  /**
   * A branch switch changes the answer to every request on the page.
   *
   * The token is new, the permission set in it is new, and every list on
   * screen was fetched under the old one — so the page is reloaded rather
   * than patched. `router.refresh()` would not do it: these are client pages
   * that fetch in effects, and nothing would re-run. Leaving half the screen
   * showing the previous branch's rows is the failure worth avoiding here.
   */
  const onBranchSwitched = useCallback(() => {
    clearSessionCache();
    window.location.reload();
  }, []);

  return (
    <>
    {/* Below md this bar carries the title, the bell and the avatar, and
        nothing else.

        Everything that did not fit a phone used to be given `hidden sm:block`
        and simply disappear: the plan chip, Upgrade, and the branch dropdown.
        The first two are an inconvenience. The third is not — the branch
        cursor is SERVER-SIDE state, every scoped list in the app answers
        differently once it moves, and below 640px there was no way to move it
        and no sign it existed. A manager on a phone was silently pinned to
        whichever branch they last chose at a desk.

        Neither is hidden now; both moved somewhere a phone has room for them.
        Upgrade is a row in the account menu, beside Settings and Log Out,
        where the other whole-account actions already are. The branch switcher
        sits at the top of the sidebar drawer, above the menu it re-scopes.
        From md up both are back in this bar and nothing about the desktop
        layout changes. */}
    <header className="flex w-full items-center justify-between gap-[12px] px-[16px] py-[16px] sm:px-[24px]">
      <div className="flex min-w-0 flex-1 items-center gap-[10px]">
        {/* On the left, beside the title, which is where the console keeps it
            and where a menu button is looked for. It used to sit on the right
            in a row of four circles, reading as a third notification icon. */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle navigation"
          className="flex size-[40px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-white text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] lg:hidden"
        >
          <MenuIcon />
        </button>

        <div className="flex min-w-0 flex-col justify-center">
          <h1 className="truncate text-[24px] leading-[1.15] font-bold tracking-[-0.5px] text-[#f5b800] sm:text-[32px] lg:text-[42px]">
            {heading}
          </h1>
          {/* Hidden on a phone: at this width it truncates to half a sentence,
              which tells you less than the title already did and costs a line
              of a screen that has few to spare. */}
          {sub && (
            <p className="mt-[2px] hidden truncate text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252] sm:block">
              {sub}
            </p>
          )}
        </div>
      </div>

      {/* Plan, then Upgrade, then the branch dropdown — in that order, because
          that is the order the questions come in: what are we on, how do I get
          more, and which shop am I looking at. The first two are also what
          EXPLAINS the third when "Add branch" is refused.

          Hidden below md, where the two of them live in the account menu and
          the sidebar instead. Only one of each is ever on screen: a hidden
          ancestor takes its dialog with it, so the copies cannot both open. */}
      <div className="hidden shrink-0 items-center gap-[12px] md:flex">
        {/* The till is the one page here with two layouts, and it is the same
            control the cashier's own top bar carries. Below sm there is no
            room for two or three columns anyway, so the choice is moot. */}
        {pathname === "/pos" && (
          <div className="hidden sm:block">
            <PosViewToggle />
          </div>
        )}
        <UpgradePlanChip />
        <UpgradeBarButton onClick={() => setUpgradeOpen(true)} />

        {/* The branch cursor lives here rather than on one page because it is
            not a filter on one screen: it is server-side state, and every
            branch-scoped list in the app answers differently once it moves.
            Reachable from wherever you notice you are in the wrong branch. */}
        <BranchSwitcher onChange={onBranchSwitched} />
      </div>

      {/* Menu — 30:15362 */}
      <div ref={menuRef} className="relative flex shrink-0 items-center gap-[12px]">
        {/* btn — 30:15364 */}
        <button
          type="button"
          onClick={openBell}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          aria-expanded={open === "bell"}
          className="relative flex size-[46px] cursor-pointer items-center justify-center overflow-clip rounded-full border-[0.5px] border-solid border-[#eaeaea] text-[#f5b800] shadow-[0px_1px_2px_0px_rgba(82,88,102,0.06)] transition-colors hover:bg-[#fffaeb]"
        >
          <BellIcon />
        </button>

        <button
          type="button"
          onClick={() => setOpen(open === "profile" ? null : "profile")}
          aria-label="Account menu"
          aria-expanded={open === "profile"}
          className="size-[46px] shrink-0 cursor-pointer overflow-hidden rounded-full"
        >
          <Image
            src={profile.avatar ?? "/sidebar/nav-avatar.png"}
            alt={profile.name}
            width={46}
            height={46}
            className="size-[46px] rounded-full object-cover"
          />
        </button>

        {open === "bell" && (
          <div className="absolute top-[58px] right-0 z-50 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[10px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
            <p className="border-b border-[#eaeaea] px-[16px] py-[12px] text-[14px] font-medium text-[#262626]">
              Notifications
            </p>
            <ul className="max-h-[320px] overflow-y-auto">
              {bellLoading && items.length === 0 && (
                <li className="px-[16px] py-[12px]">
                  <ListSkeleton rows={3} />
                </li>
              )}
              {!bellLoading && bellError && (
                <li className="px-[16px] py-[20px] text-[13px] text-[#525252]">
                  Could not load notifications.
                </li>
              )}
              {!bellLoading && !bellError && items.length === 0 && (
                <li className="px-[16px] py-[20px] text-[13px] text-[#525252]">Nothing new.</li>
              )}
              {items.map((n) => (
                <li key={n.id} className="border-b border-[#f5f5f5] px-[16px] py-[12px] last:border-b-0">
                  <p className="text-[13px] font-medium text-[#262626]">{n.title}</p>
                  <p className="mt-[2px] text-[12px] text-[#525252]">{n.message}</p>
                  <p className="mt-[4px] text-[11px] text-[#8a8a8a]">{relativeTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {open === "profile" && (
          <div className="absolute top-[58px] right-0 z-50 w-[220px] overflow-hidden rounded-[10px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
            <div className="border-b border-[#eaeaea] px-[16px] py-[12px]">
              <p className="truncate text-[14px] font-medium text-[#262626]">{profile.name}</p>
              <p className="truncate text-[12px] text-[#525252]">{profile.email}</p>
            </div>
            {/* Above Settings, and only below md — from there up it is the
                button in the bar. Closing the menu when the dialog opens is
                the point of `onOpen`: leaving a dropdown hanging over a modal
                is how you end up clicking the wrong one. */}
            <div className="md:hidden">
              <UpgradeMenuItem
                onClick={() => {
                  setUpgradeOpen(true);
                  setOpen(null);
                }}
              />
            </div>
            <Link
              href="/settings"
              onClick={() => setOpen(null)}
              className="block px-[16px] py-[10px] text-[13px] text-[#525252] hover:bg-[#fafafa]"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={logout}
              className="block w-full cursor-pointer px-[16px] py-[10px] text-left text-[13px] text-[#e5484d] hover:bg-[#fafafa]"
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    </header>
    {/* Sleek rule separating the bar from the page. */}
    <div className="h-px w-full shrink-0 bg-[#1e1e1e]/12" />
    <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </>
  );
}
