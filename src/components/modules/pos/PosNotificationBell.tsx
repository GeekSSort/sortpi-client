"use client";

import React, { useEffect, useRef, useState } from "react";
import { NotificationService } from "@/services";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { BellIcon } from "./toolbarIcons";

/**
 * The toolbar's bell — Figma 6:920.
 *
 * Reads the SAME cache key as PosHead's bell and the dashboard header's, so
 * the three cannot disagree and marking a batch read here clears the badge in
 * all of them.
 *
 * The frame draws the red dot unconditionally. It appears here only when
 * something is actually unread — a permanent alarm on a till is one a cashier
 * stops seeing by the second morning.
 */
export default function PosNotificationBell({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unreadCount } = useQuery(
    queryKey("notifications", { scope: "unread-count" }),
    () => NotificationService.unreadCount(),
    { staleMs: 60_000 }
  );
  const unread = unreadCount ?? 0;

  // Only asked for once the panel is open: the till renders this row on every
  // screen and the list is worth nothing until somebody looks at it.
  const { data: items, loading } = useQuery(
    queryKey("notifications", { scope: "list" }),
    () => NotificationService.list(),
    { enabled: open, staleMs: 30_000 }
  );

  // Opening the panel is what marks them read. In an effect rather than the
  // click handler because the rows arrive from the cache, which may hand them
  // over before the click has finished.
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

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className={className}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-[9px] right-[9px] size-[6px] rounded-[100px] bg-[#c80000]"
          />
        )}
      </button>

      {open && (
        <>
          {/* Tap anywhere else to close. Behind the panel, so the panel's own
              taps still land. */}
          <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-20" />
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute top-[46px] right-0 z-30 w-[280px] overflow-hidden rounded-[4px] border border-solid border-[#e7e7e7] bg-white shadow-[0_8px_20px_-6px_rgba(16,24,40,0.12)]"
          >
            {loading && <p className="p-[12px] text-[13px] text-[#666]">Loading…</p>}
            {!loading && (items ?? []).length === 0 && (
              <p className="p-[12px] text-[13px] text-[#666]">Nothing new.</p>
            )}
            {(items ?? []).slice(0, 6).map((n) => (
              <div
                key={n.id}
                className="border-b border-solid border-[#f2f2f2] p-[12px] last:border-b-0"
              >
                <p className="text-[13px] leading-[1.4] font-medium text-[#1e1e1e]">{n.title}</p>
                {n.message && (
                  <p className="mt-[2px] text-[12px] leading-[1.4] text-[#666]">{n.message}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
