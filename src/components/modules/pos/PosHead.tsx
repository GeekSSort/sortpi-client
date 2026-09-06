"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationService } from "@/services";
import { setPosView, usePosView } from "./posView";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { ListSkeleton } from "@/components/shared/Skeleton";
import BranchSwitcher from "@/components/shared/BranchSwitcher";
import { QueryBoundary } from "@/components/shared/QueryBoundary";
import { useSession } from "@/services/useSession";

/**
 * The till's top bar — Figma 247:13658.
 *
 * A gold title on the left, a round bell button and the avatar on the right.
 *
 * Not the dashboard's Header: that one has a subtitle and carries the
 * notification and profile menus. The till stays quiet — the page name and who
 * is on the terminal, nothing else.
 */

/** Two panes, side by side. */
function TwoColumnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="6.5" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="2.5" width="6.5" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Three panes: products, basket, money. */
function ThreeColumnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="4" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="2.5" width="4" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12.5" y="2.5" width="4" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 2.5a5 5 0 0 0-5 5v2.764a2.5 2.5 0 0 1-.528 1.535l-.79 1.017A.75.75 0 0 0 4.276 14h11.448a.75.75 0 0 0 .594-1.184l-.79-1.017A2.5 2.5 0 0 1 15 10.264V7.5a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 16.25a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Route -> the 40px title. The rail and the head always agree. */
function titleForPath(pathname: string): string {
  if (pathname.startsWith("/pos/customers")) return "Customers";
  if (pathname.startsWith("/pos/products")) return "Products";
  if (pathname.startsWith("/pos/reports")) return "Reports";
  if (pathname.startsWith("/pos/discount")) return "Discount";
  if (pathname.startsWith("/pos/settings")) return "Settings";
  if (pathname.startsWith("/pos/sales")) return "Sales";
  if (pathname.startsWith("/pos/return")) return "Return";
  return "POS";
}

function ExitIcon() {
  const s = {
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M11.25 5.6V4.5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1.1" {...s} />
      <path d="M7.5 9h7.25" {...s} />
      <path d="M12.6 6.9 14.75 9l-2.15 2.1" {...s} />
    </svg>
  );
}

export default function PosHead() {
  const pathname = usePathname();
  const { user: session } = useSession();

  // The bell was a button with no handler. Same behaviour as the dashboard's:
  // opening it lists the notifications and marks them read.
  const [open, setOpen] = useState(false);
  const view = usePosView();
  const ref = useRef<HTMLDivElement>(null);

  // Through the cache so the badge follows the same count the dashboard's
  // header shows, and so marking a batch read here clears it there too.
  const { data: unreadCount } = useQuery(
    queryKey("notifications", { scope: "unread-count" }),
    () => NotificationService.unreadCount(),
    { staleMs: 60_000 }
  );
  const unread = unreadCount ?? 0;

  // Only asked for once the panel is open — a till loads this header on every
  // screen and the list is worth nothing until somebody looks at it.
  const {
    data: items,
    loading: itemsLoading,
    error: itemsError,
    refetch: refetchItems,
  } = useQuery(
    queryKey("notifications", { scope: "list" }),
    () => NotificationService.list(),
    { enabled: open, staleMs: 30_000 }
  );

  // Opening the panel is what marks them read. Kept in an effect rather than
  // in the click handler because the rows arrive from the cache, which may
  // hand them over before the click has finished.
  const markedRef = useRef(false);
  useEffect(() => {
    if (!open || !items) return;
    const unreadIds = items.filter((n) => !n.isRead).map((n) => n.id);
    if (!unreadIds.length || markedRef.current) return;
    markedRef.current = true;
    NotificationService.markRead(unreadIds)
      .then(() => invalidate("notifications"))
      // A failed mark-read must not leave a badge that lies in the other
      // direction: the count stays as it was and the next open tries again.
      .catch(() => {
        markedRef.current = false;
      });
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleBell = () => {
    if (open) {
      setOpen(false);
      return;
    }
    markedRef.current = false;
    setOpen(true);
  };

  return (
    <header className="flex w-full shrink-0 items-center justify-between border-b border-solid border-[#eaeaea] bg-white px-[24px] py-[12px]">
      <h1 className="text-[40px] leading-[1.2] font-semibold whitespace-nowrap text-[#f5b800]">
        {titleForPath(pathname)}
      </h1>

      <div ref={ref} className="relative flex shrink-0 items-center gap-[12px]">
        {/* Only the till has two layouts, so the switch lives here rather than
            in the shared header. */}
        {pathname === "/pos" && (
          <div className="flex items-center gap-[2px] rounded-[10px] bg-[#f0ede6] p-[3px]">
            {(
              [
                ["classic", "Two columns", TwoColumnIcon],
                ["columns", "Three columns", ThreeColumnIcon],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPosView(mode)}
                aria-label={label}
                aria-pressed={view === mode}
                title={label}
                className={`flex size-[34px] cursor-pointer items-center justify-center rounded-[8px] transition-colors duration-200 ${
                  view === mode
                    ? "bg-white text-[#f5b800] shadow-[0_1px_2px_rgba(82,88,102,0.10)]"
                    : "text-[#8f8d87] hover:text-[#1e1e1e]"
                }`}
              >
                <Icon />
              </button>
            ))}
          </div>
        )}

        {/* Same control as the back office's header, same component. The till
            is branch-scoped like every other screen, and a supervisor who
            opens it in the wrong branch could previously only fix that by
            leaving. It renders nothing for anyone without `branch.view`, so a
            cashier's till bar is unchanged. */}
        <div className="hidden md:block">
          <BranchSwitcher onChange={() => window.location.reload()} />
        </div>

        {/* The way out.
            The till owns the whole window — it has its own rail and its own
            head, and nothing in either led back to the back office. A cashier
            who opened the POS could only return by editing the address bar,
            which on a touch terminal is no way out at all. */}
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          title="Back to dashboard"
          className="flex h-[40px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[22px] border-[0.5px] border-solid border-[#eaeaea] bg-white px-[14px] text-[14px] leading-[1.5] font-medium tracking-[-0.28px] whitespace-nowrap text-[#525252] shadow-[0px_1px_2px_0px_rgba(82,88,102,0.06)] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]"
        >
          <ExitIcon />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>

        <button
          type="button"
          onClick={toggleBell}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          aria-expanded={open}
          className="relative flex size-[40px] cursor-pointer items-center justify-center overflow-visible rounded-[22px] border-[0.5px] border-solid border-[#eaeaea] bg-white px-[14px] py-[12px] text-[#f5b800] shadow-[0px_1px_2px_0px_rgba(82,88,102,0.06)] transition-colors hover:bg-[#fafafa]"
        >
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -top-[2px] -right-[2px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#a02620] px-[4px] text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        <span className="relative size-[40px] shrink-0 overflow-hidden rounded-full">
          <Image
            src={session?.avatar || "/sidebar/nav-avatar.png"}
            alt={session?.name || ""}
            fill
            sizes="40px"
            className="object-cover"
          />
        </span>

        {open && (
          <div className="absolute top-[52px] right-0 z-40 w-[320px] overflow-hidden rounded-[12px] border border-[#eaeaea] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
            <p className="border-b border-[#f0f0f0] px-[16px] py-[12px] text-[13px] font-semibold text-[#1e1e1e]">
              Notifications
            </p>
            <QueryBoundary
              loading={itemsLoading}
              error={itemsError}
              hasData={items !== undefined}
              skeleton={
                <div className="px-[16px]">
                  <ListSkeleton rows={4} />
                </div>
              }
              errorMessage="Could not load notifications."
              onRetry={refetchItems}
            >
            {(items ?? []).length === 0 ? (
              <p className="px-[16px] py-[20px] text-center text-[13px] text-[#737373]">
                Nothing yet.
              </p>
            ) : (
              <ul className="max-h-[320px] overflow-y-auto">
                {(items ?? []).map((n) => (
                  <li key={n.id} className="border-b border-[#f5f5f5] px-[16px] py-[10px] last:border-b-0">
                    <p className="text-[13px] font-medium text-[#1e1e1e]">{n.title}</p>
                    <p className="text-[12px] leading-[1.5] text-[#525252]">{n.message}</p>
                  </li>
                ))}
              </ul>
            )}
            </QueryBoundary>
          </div>
        )}
      </div>
    </header>
  );
}
