"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NotificationService } from "@/services";
import { NotificationItem } from "@/types/notifications";
import { setPosView, usePosView } from "./posView";
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

export default function PosHead() {
  const pathname = usePathname();
  const { user: session } = useSession();

  // The bell was a button with no handler. Same behaviour as the dashboard's:
  // opening it lists the notifications and marks them read.
  const [open, setOpen] = useState(false);
  const view = usePosView();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    NotificationService.unreadCount()
      .then((n) => alive && setUnread(n))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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

  const toggleBell = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    const list = await NotificationService.list();
    setItems(list);
    const unreadIds = list.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length) {
      await NotificationService.markRead(unreadIds);
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    }
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
            {items.length === 0 ? (
              <p className="px-[16px] py-[20px] text-center text-[13px] text-[#737373]">
                Nothing yet.
              </p>
            ) : (
              <ul className="max-h-[320px] overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id} className="border-b border-[#f5f5f5] px-[16px] py-[10px] last:border-b-0">
                    <p className="text-[13px] font-medium text-[#1e1e1e]">{n.title}</p>
                    <p className="text-[12px] leading-[1.5] text-[#525252]">{n.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
