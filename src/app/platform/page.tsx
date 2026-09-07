"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/services/apiClient";
import {
  PlatformService,
  PlanRow,
  SubscriptionRow,
  TenantRow,
  toDate,
  toLabel,
} from "@/services/platformService";
import { useQuery } from "@/lib/query/useQuery";
import {
  ChartSkeleton,
  DetailSkeleton,
  ListSkeleton,
  StatCardsSkeleton,
} from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import StatCard from "@/components/platform/StatCard";
import { statGood, statMoney, statRisk, statWait } from "@/components/platform/stats";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import { formatMoney } from "@/lib/format";

/**
 * The console home.
 *
 * Counted in the browser from the three lists the console already serves:
 * companies, subscriptions and plans. It answers what a Monday morning asks —
 * what we earn, who is about to leave, who just joined.
 *
 * Gold is money and nothing else. Green is paying, blue is on trial, red needs
 * chasing; a page where everything is gold says nothing is more important than
 * anything else.
 */

const TONE: Record<string, Tone> = {
  ACTIVE: "green",
  TRIALING: "orange",
  PAST_DUE: "gold",
  SUSPENDED: "rose",
  CANCELLED: "slate",
};

const GOLD = "#f5b800";
const GREEN = "#00b837";
const BLUE = "#3b82f6";
const RED = "#e63946";
const SLATE = "#94a3b8";
const DAY = 24 * 60 * 60 * 1000;

const CARD = "rounded-[12px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea]";
const TITLE = "text-[16px] leading-[1.5] font-medium tracking-[-0.32px] text-[#1e1e1e]";


interface Bar {
  label: string;
  value: number;
  colour: string;
  /** Shown on the bar; the value formatted the way that view wants it. */
  display: string;
}

/** New companies in each of the last six months. */
function signupsByMonth(tenants: TenantRow[], now: number): Bar[] {
  const today = new Date(now);
  const buckets: { label: string; key: string; count: number }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    buckets.push({
      label: d.toLocaleString("en-GB", { month: "short" }),
      key: `${d.getFullYear()}-${d.getMonth()}`,
      count: 0,
    });
  }
  for (const t of tenants) {
    const at = new Date(t.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    const bucket = buckets.find((b) => b.key === `${at.getFullYear()}-${at.getMonth()}`);
    if (bucket) bucket.count += 1;
  }
  return buckets.map((b) => ({
    label: b.label,
    value: b.count,
    colour: BLUE,
    display: String(b.count),
  }));
}

/** What each plan brings in, from the companies actually paying for it. */
function revenueByPlan(plans: PlanRow[], subs: SubscriptionRow[]): Bar[] {
  return plans
    .map((p) => {
      const paying = subs.filter((s) => s.status === "ACTIVE" && s.planName === p.name);
      return {
        label: p.name,
        value: paying.length * p.price,
        colour: GOLD,
        display: formatMoney(paying.length * p.price),
      };
    })
    .filter((b) => b.value > 0);
}

/** How the companies are spread across the plans, paying or not. */
function companiesByPlan(plans: PlanRow[], tenants: TenantRow[]): Bar[] {
  const shades = [GOLD, GREEN, BLUE, "#a855f7", "#f97316", SLATE];
  return plans
    .map((p, i) => ({
      label: p.name,
      value: tenants.filter((t) => t.plan === p.code).length,
      colour: shades[i % shades.length],
      display: String(tenants.filter((t) => t.plan === p.code).length),
    }))
    .filter((b) => b.value > 0);
}

const VIEWS = ["Revenue", "Sign-ups", "Plan mix"] as const;

/** A shop account reaching the console is a different problem from a dead API. */
function describe(e: unknown): string {
  if (e instanceof ApiError && e.code === "REALM_MISMATCH")
    return "This is a shop account. The console needs a SortPi staff sign-in.";
  if (e instanceof ApiError) return e.message;
  return "Could not load the console.";
}

export default function PlatformDashboardPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]>("Revenue");

  // One key for the whole screen: the three lists are only ever read together
  // here, and every console write names `platform-overview` so these figures
  // are never left behind by a change made on another screen.
  const { data, loading, fetching, error, refetch } = useQuery("platform-overview", async () => {
    const [t, s, p] = await Promise.all([
      PlatformService.listTenants(),
      PlatformService.listSubscriptions(),
      PlatformService.listPlans(),
    ]);
    return {
      // SYSTEM is our own organization, not a customer.
      tenants: t.data.filter((r) => r.name !== "SYSTEM") as TenantRow[],
      subs: s.data as SubscriptionRow[],
      plans: p.data as PlanRow[],
      // The clock is read with the data, not while rendering: reading it during
      // a render makes the render impure and the figures drift between paints.
      at: Date.now(),
    };
  });

  const tenants = data?.tenants ?? [];
  const subs = data?.subs ?? [];
  const now = data?.at ?? null;

  const paying = tenants.filter((t) => t.status === "ACTIVE");
  const trialing = tenants.filter((t) => t.status === "TRIALING");
  const chasing = tenants.filter((t) => t.status === "PAST_DUE" || t.status === "SUSPENDED");

  const monthly = subs.filter((s) => s.status === "ACTIVE").reduce((sum, s) => sum + s.planPrice, 0);
  const trialValue = subs.filter((s) => s.status === "TRIALING").reduce((sum, s) => sum + s.planPrice, 0);
  const perCompany = paying.length ? monthly / paying.length : 0;

  const endingSoon = subs.filter(
    (s) => s.status === "TRIALING" && s.trialEndsAt && now !== null && new Date(s.trialEndsAt).getTime() - now < 7 * DAY
  );

  // Read straight off `data` rather than the defaulted copies above: those are
  // fresh arrays on every render while the request is out, which would make
  // this memo recompute each paint.
  const bars = useMemo<Bar[]>(() => {
    if (!data) return [];
    if (view === "Sign-ups") return signupsByMonth(data.tenants, data.at);
    if (view === "Plan mix") return companiesByPlan(data.plans, data.tenants);
    return revenueByPlan(data.plans, data.subs);
  }, [view, data]);
  const peak = Math.max(1, ...bars.map((b) => b.value));

  const recent = [...tenants].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  const nameOf = (id: string) => tenants.find((t) => t.id === id)?.name || id.slice(0, 8);

  // The waiting picture is the real page with its content greyed out: four
  // cards, the chart panel beside the standing panel, then the two lists.
  // A single spinner would collapse the layout and rebuild it a second later.
  const skeleton = (
    <>
      <StatCardsSkeleton count={4} />
      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-[1.5fr_1fr]">
        <section className={CARD}>
          <ChartSkeleton height={190} />
        </section>
        <section className={CARD}>
          <DetailSkeleton rows={4} />
        </section>
      </div>
      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
        <section className={CARD}>
          <ListSkeleton rows={4} />
        </section>
        <section className={CARD}>
          <ListSkeleton rows={5} />
        </section>
      </div>
    </>
  );

  return (
    // `relative` because RefreshBar is absolutely positioned across the top.
    <div className="sp-panel-up relative flex w-full flex-col gap-[16px]">
      <RefreshBar active={fetching} />
      <QueryBoundary
        loading={loading}
        error={error}
        hasData={data !== undefined}
        skeleton={skeleton}
        errorMessage={describe(error)}
        onRetry={refetch}
      >
        {/* Money first, then who is paying, who might, and who has stopped. */}
        <div className="grid grid-cols-2 gap-[12px] xl:grid-cols-4">
          <StatCard
            {...statMoney({
              label: "Monthly revenue",
              value: formatMoney(monthly),
              note: `${formatMoney(monthly * 12)} a year at this rate`,
              href: "/platform/subscriptions",
            })}
          />
          <StatCard
            {...statGood({
              label: "Paying",
              value: paying.length,
              note: "on an active plan",
              href: "/platform/companies",
            })}
          />
          <StatCard
            {...statWait({
              label: "On trial",
              value: trialing.length,
              note: endingSoon.length
                ? `${endingSoon.length} ending this week`
                : `${formatMoney(trialValue)} if they convert`,
              href: "/platform/subscriptions",
            })}
          />
          <StatCard
            {...statRisk({
              label: "Need chasing",
              value: chasing.length,
              note: "overdue or stopped",
              href: "/platform/companies",
            })}
          />
        </div>

        <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-[1.5fr_1fr]">
          {/* One chart, three questions. Bars rather than a line: at this many
              companies a line would draw a slope that is not really there. */}
          <section className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-[12px]">
              <h2 className={TITLE}>
                {view === "Revenue" ? "Revenue by plan" : view === "Sign-ups" ? "New companies" : "Companies per plan"}
              </h2>
              <div className="flex items-center gap-[2px] rounded-[10px] bg-[#f5f4f1] p-[3px]">
                {VIEWS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`cursor-pointer rounded-[8px] px-[12px] py-[6px] text-[13px] font-medium transition-colors duration-200 ${
                      view === v
                        ? "bg-white text-[#1e1e1e] shadow-[0_1px_2px_rgba(82,88,102,0.10)]"
                        : "text-[#525252] hover:text-[#1e1e1e]"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-[22px] flex h-[190px] items-end gap-[12px]">
              {bars.length === 0 && (
                <p className="w-full self-center text-center text-[14px] text-[#525252]">
                  {view === "Revenue" ? "Nobody is paying yet." : "Nothing to show yet."}
                </p>
              )}
              {bars.map((b) => (
                <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center gap-[8px]">
                  <span className="text-[12px] font-medium text-[#525252] tabular-nums">{b.display}</span>
                  <div
                    title={`${b.label}: ${b.display}`}
                    style={{
                      height: `${Math.max(6, (b.value / peak) * 132)}px`,
                      backgroundColor: b.colour,
                    }}
                    className="w-full cursor-default rounded-t-[6px] transition-all duration-500 ease-out hover:opacity-80"
                  />
                  <span className="w-full truncate text-center text-[12px] text-[#8f8d87]">{b.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* The split, as a share rather than a count. */}
          <section className={CARD}>
            <h2 className={TITLE}>Where companies stand</h2>
            <div className="mt-[16px] flex flex-col gap-[14px]">
              {(
                [
                  ["Paying", paying.length, GREEN],
                  ["On trial", trialing.length, BLUE],
                  ["Need chasing", chasing.length, RED],
                  ["No plan", tenants.filter((t) => !t.plan).length, SLATE],
                ] as const
              ).map(([label, count, colour]) => (
                <div key={label} className="flex flex-col gap-[6px]">
                  <span className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-[8px] text-[#1e1e1e]">
                      <span className="size-[8px] rounded-full" style={{ backgroundColor: colour }} />
                      {label}
                    </span>
                    <span className="text-[#525252] tabular-nums">{count}</span>
                  </span>
                  <span className="h-[8px] w-full overflow-hidden rounded-full bg-[#f0ede6]">
                    <span
                      style={{
                        width: `${tenants.length ? (count / tenants.length) * 100 : 0}%`,
                        backgroundColor: colour,
                      }}
                      className="block h-full rounded-full transition-all duration-500 ease-out"
                    />
                  </span>
                </div>
              ))}
              <p className="mt-[2px] text-[12px] text-[#8f8d87]">
                {formatMoney(perCompany)} a month from each paying company.
              </p>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
          {/* Whoever needs a phone call today. */}
          <section className={CARD}>
            <div className="flex items-center justify-between gap-[12px]">
              <h2 className={TITLE}>Needs attention</h2>
              <Link
                href="/platform/companies"
                className="cursor-pointer text-[13px] font-medium text-[#f5b800] transition-opacity hover:underline hover:opacity-80"
              >
                All companies
              </Link>
            </div>
            <div className="mt-[14px] flex flex-col">
              {chasing.length === 0 && endingSoon.length === 0 && (
                <p className="py-[10px] text-[14px] text-[#525252]">
                  Nothing overdue and no trial ending this week.
                </p>
              )}
              {chasing.map((t) => (
                <Link
                  key={t.id}
                  href="/platform/companies"
                  className="-mx-[8px] flex cursor-pointer items-center justify-between gap-[12px] rounded-[8px] border-b border-[#f0ede6] px-[8px] py-[10px] transition-colors last:border-0 hover:bg-[#fafafa]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-[#1e1e1e]">{t.name}</span>
                    <span className="block truncate text-[12px] text-[#8f8d87]">{toLabel(t.plan)}</span>
                  </span>
                  <StatusPill label={toLabel(t.status)} tone={TONE[String(t.status)] ?? "slate"} />
                </Link>
              ))}
              {endingSoon.map((s) => (
                <Link
                  key={s.id}
                  href="/platform/subscriptions"
                  className="-mx-[8px] flex cursor-pointer items-center justify-between gap-[12px] rounded-[8px] border-b border-[#f0ede6] px-[8px] py-[10px] transition-colors last:border-0 hover:bg-[#fafafa]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-[#1e1e1e]">
                      {nameOf(s.organizationId)}
                    </span>
                    <span className="block truncate text-[12px] text-[#8f8d87]">
                      Trial ends {toDate(s.trialEndsAt)}
                    </span>
                  </span>
                  <StatusPill label="Trial ending" tone="orange" />
                </Link>
              ))}
            </div>
          </section>

          {/* The newest sign-ups, so a support call has context. */}
          <section className={CARD}>
            <div className="flex items-center justify-between gap-[12px]">
              <h2 className={TITLE}>Latest sign-ups</h2>
              <Link
                href="/platform/companies"
                className="cursor-pointer text-[13px] font-medium text-[#f5b800] transition-opacity hover:underline hover:opacity-80"
              >
                All companies
              </Link>
            </div>
            <div className="mt-[14px] flex flex-col">
              {recent.length === 0 && (
                <p className="py-[10px] text-[14px] text-[#525252]">No companies yet.</p>
              )}
              {recent.map((t) => (
                <Link
                  key={t.id}
                  href="/platform/companies"
                  className="-mx-[8px] flex cursor-pointer items-center justify-between gap-[12px] rounded-[8px] border-b border-[#f0ede6] px-[8px] py-[10px] transition-colors last:border-0 hover:bg-[#fafafa]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-[#1e1e1e]">{t.name}</span>
                    <span className="block truncate text-[12px] text-[#8f8d87]">
                      {t.userCount} people &middot; {t.branchCount} branches
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] text-[#525252]">{toDate(t.createdAt)}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <p className="text-[12px] text-[#8f8d87]">
          Counted in this browser from the companies, subscriptions and plans lists. The
          console API has no summary call yet, and no history, so these are today&rsquo;s
          figures only.
        </p>
      </QueryBoundary>
    </div>
  );
}
