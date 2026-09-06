"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AuthService } from "@/services/authService";
import { clearSessionCache, useSession } from "@/services/useSession";

/**
 * The console menu.
 *
 * Same shape and colours as the shop sidebar: 240 wide on #eaeaea, 37px rows,
 * and a white card for the page you are on. Different entries, because the
 * console works across companies and has no shop of its own.
 */

const NAV = [
  { name: "Dashboard", href: "/platform", exact: true, icon: DashboardIcon },
  { name: "Companies", href: "/platform/companies", icon: CompaniesIcon },
  { name: "Subscriptions", href: "/platform/subscriptions", icon: SubscriptionsIcon },
  { name: "Invoices", href: "/platform/invoices", icon: InvoicesIcon },
  { name: "Plans", href: "/platform/plans", icon: PlansIcon },
  { name: "Staff", href: "/platform/staff", icon: StaffIcon },
];

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="block shrink-0">
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="2.5" width="6.5" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="8.5" width="6.5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CompaniesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="block shrink-0">
      <path d="M2.5 17.5h15M4 17.5V4.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v13M12 8.5h3a1 1 0 0 1 1 1v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7h3M6.5 10h3M6.5 13h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SubscriptionsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="block shrink-0">
      <path d="M17 10a7 7 0 1 1-2.05-4.95" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M17 3v3.5h-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 6.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InvoicesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="block shrink-0">
      <path d="M5 2.5h10a1 1 0 0 1 1 1v14l-2.5-1.5L11 17.5 8.5 16 6 17.5 3.5 16V3.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 6.5h7M6.5 9.5h7M6.5 12.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlansIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="block shrink-0">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 8h15M8 8v8.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function StaffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="block shrink-0">
      <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 16.5c0-2.5 2.4-4.5 5.5-4.5s5.5 2 5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M14 5.2a2.6 2.6 0 0 1 0 4.6M15.5 16.5c0-1.7-.6-3.2-1.7-4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="block shrink-0">
      <path d="M12.5 6V4.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 10h8m0 0-2.5-2.5M16.5 10 14 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function isConsoleRouteActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

export default function PlatformSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <>
      {/* Below lg the menu slides over the page, so it needs a backdrop. */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[240px] shrink-0 overflow-hidden bg-[#eaeaea] px-[16px] py-[20px] transition-transform duration-300 ease-in-out select-none lg:static lg:z-40 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full w-[208px] flex-col justify-between">
          <div className="flex w-full flex-col items-center gap-[32px]">
            <Link href="/platform" className="block h-[54px] w-[208px] shrink-0">
              <Image
                src="/sidebar/logo.png"
                alt="SORTPoint"
                width={208}
                height={54}
                priority
                className="h-[54px] w-[208px] object-contain"
              />
            </Link>

            <nav className="flex w-[208px] flex-col gap-[8px]">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = isConsoleRouteActive(pathname, item.href, item.exact);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onClose}
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

          <div className="flex w-full flex-col gap-[12px]">
            <button
              type="button"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                // Clear the tokens, or the route guard lets you straight back in.
                await AuthService.logout();
                clearSessionCache();
                router.replace("/login");
              }}
              className="flex h-[50px] w-full cursor-pointer flex-col items-start justify-center rounded-[10px] border border-solid border-[#525252] px-[12px] disabled:opacity-60"
            >
              <span className="flex h-[20px] w-full items-center justify-between">
                <span className="text-[14px] leading-[1.4] font-medium whitespace-nowrap text-[#525252]">
                  {signingOut ? "Signing out..." : "Log Out"}
                </span>
                <span className="text-[#525252]">
                  <LogOutIcon />
                </span>
              </span>
            </button>

            <div className="h-px w-[208px] bg-[#525252]" />

            <div className="flex w-full items-center gap-[10px]">
              <span className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-[#1e1e1e] text-[14px] font-semibold text-white">
                {(user?.name || "S").slice(0, 1).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-medium text-[#1e1e1e]">
                  {user?.name || "SORTPoint staff"}
                </span>
                <span className="truncate text-[12px] text-[#525252]">{user?.email || "console"}</span>
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
