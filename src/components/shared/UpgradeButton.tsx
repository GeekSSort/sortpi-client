"use client";

import React, { useMemo, useState } from "react";
import { BillingService, UpgradePlan } from "@/services/billingService";
import { useSession } from "@/services/useSession";
import { useQuery } from "@/lib/query/useQuery";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";

/**
 * Move the company up a plan, from the top bar.
 *
 * The ceilings were enforced and unreachable: `LimitService` refused the write
 * and nothing anywhere let an owner do something about it. The only way off a
 * plan was to ask support, and the only way to discover you were on the wrong
 * one was to be refused mid-form.
 *
 * UP only. Going down means deciding what happens to the branches, seats and
 * products that no longer fit, and a button cannot make that decision — the
 * server refuses it with `PLAN_DOWNGRADE_NOT_ALLOWED` and names which limits
 * would drop, which is what the rows below grey out on.
 *
 * Shown only to somebody who could actually use it: `billing.manage` is the
 * Admin's, and a cashier seeing "Upgrade" in the bar would be reading an offer
 * the server refuses.
 *
 * NOTHING IS CHARGED YET, so nothing is switched yet. There is no gateway and
 * no card on file, and the subscription is what every ceiling in the app is
 * checked against — an owner pressing a button and getting a dearer plan for
 * free is the one outcome worse than not being able to upgrade at all. So the
 * list still shows what a company could move to and what it would cost, and
 * confirming records the request and says who to talk to. The
 * `POST /billing/subscription/upgrade` endpoint is untouched and still works;
 * it is this dialog that no longer calls it. Restore the call in `request()`
 * once payment methods are integrated.
 */

const LIMIT_LABEL: Record<string, string> = {
  max_branches: "branches",
  max_users: "people",
  max_products: "products",
};

function limitText(value: number | null | undefined): string {
  return value === null || value === undefined ? "Unlimited" : String(value);
}

/** A card, for the plan the company is on. */
function PlanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <rect x="2.5" y="5" width="15" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** An icon that says "more", not "buy": an upward step. */
function UpgradeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path
        d="M10 15.5V5M10 5 5.5 9.5M10 5l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The plan dialog, and the two things that open it.
 *
 * They are SEPARATE exports on purpose, and the reason is a bug this shape
 * fixes. The first version put a "menu" variant of the whole component inside
 * the account dropdown — trigger and dialog together — and opening the dialog
 * closed the dropdown, which UNMOUNTED the component and took the dialog with
 * it. The button did nothing at all on a phone, and a test that only checked
 * the row was visible could not see it.
 *
 * So the dialog is mounted once, by whoever owns the page chrome, and lives
 * outside anything that can disappear. The triggers are plain buttons that ask
 * it to open.
 */
export function UpgradeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user: session } = useSession();
  const [chosen, setChosen] = useState<string>("");
  /**
   * The plan somebody asked for, held here instead of sent.
   *
   * Nothing charges for a plan yet: there is no gateway, no invoice and no
   * card on file, so `POST /billing/subscription/upgrade` would move a company
   * onto a dearer plan and bill nobody. Until a payment method is wired up the
   * dialog takes the request and says who to talk to, rather than quietly
   * handing out plans for free.
   */
  const [requested, setRequested] = useState<UpgradePlan | null>(null);

  const mayManage = session?.permissions.includes("billing.manage") ?? false;
  const subscription = session?.subscription ?? null;

  // Reset when it OPENS, adjusted during render rather than in an effect —
  // setState in an effect body is a cascading render and a lint error here.
  // Without it, reopening the dialog shows the last request's "payment method
  // required" panel as though it had just been asked for again.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRequested(null);
      setChosen("");
    }
  }

  const { data } = useQuery(
    "billing-plans",
    () => BillingService.plans(),
    // Only once the dialog is open: a price list is not worth a request on
    // every page load of every session.
    { enabled: open }
  );
  const plans = useMemo(() => data ?? [], [data]);

  /**
   * Which plans are actually a step UP, decided here the same way the server
   * decides it: no ceiling may drop, and `null` is the highest value there is.
   *
   * Greying out a row the server would refuse is the difference between a
   * price list and a menu of things that work.
   */
  const offered = useMemo(() => {
    if (!subscription) return plans.map((plan) => ({ plan, allowed: true, why: "" }));
    return plans.map((plan) => {
      if (plan.code === subscription.plan) {
        return { plan, allowed: false, why: "Your current plan" };
      }
      const lowered: string[] = [];
      for (const name of Object.keys(LIMIT_LABEL)) {
        const current = subscription.limits?.[name];
        const proposed = plan.limits?.[name];

        // null on the PROPOSED plan means no ceiling — always a step up.
        if (proposed === null || proposed === undefined) continue;

        // null on the CURRENT plan means the company is already unlimited, so
        // any finite ceiling is a reduction.
        if (current === null) {
          lowered.push(LIMIT_LABEL[name]);
          continue;
        }

        // UNDEFINED is not "unlimited" — it is "the server did not say", and
        // treating the two the same is what made every plan look like a
        // downgrade: the limits map arrives camelCased, so every snake_case
        // read was undefined and every comparison fell into this branch.
        // With nothing to compare against, defer to the server, which owns
        // the rule and will refuse a real downgrade.
        if (current === undefined) continue;

        if (proposed < current || proposed < (subscription.usage?.[name] ?? 0)) {
          lowered.push(LIMIT_LABEL[name]);
        }
      }
      return {
        plan,
        allowed: lowered.length === 0,
        why: lowered.length ? `Fewer ${lowered.join(", ")} than you have now` : "",
      };
    });
  }, [plans, subscription]);

  // The PLAN is shown to anybody who can see the bar; only the button that
  // changes it needs `billing.manage`. An owner asking "what are we on?" and a
  // cashier asking it are the same question, and hiding the answer from one of
  // them makes the limit refusals unexplainable.
  if (!subscription) return null;

  /**
   * Take the request; do not make the change.
   *
   * `BillingService.upgrade` is deliberately not called. The subscription is
   * what every ceiling in the app is checked against, so moving it is the one
   * thing here that must not happen before there is a way to charge for it.
   */
  const request = () => {
    const plan = plans.find((p) => p.code === chosen);
    if (!plan) return;
    setRequested(plan);
  };

  return (
    <>
      <Modal
        open={open && mayManage}
        onClose={onClose}
        title={requested ? "Payment method required" : "Move up a plan"}
        width={620}
        footer={
          requested ? (
            <>
              {/* Back, not Cancel: somebody who has just been told their plan
                  did not change should be able to look at the list again
                  without reopening the dialog from the bar. */}
              <button
                type="button"
                className={MODAL_GHOST}
                onClick={() => setRequested(null)}
              >
                Back to plans
              </button>
              <button
                type="button"
                style={{ backgroundImage: GOLD_GRADIENT }}
                className={MODAL_PRIMARY}
                onClick={onClose}
              >
                Got it
              </button>
            </>
          ) : (
            <>
              <button type="button" className={MODAL_GHOST} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!chosen}
                style={{ backgroundImage: GOLD_GRADIENT }}
                className={MODAL_PRIMARY}
                onClick={request}
              >
                Continue
              </button>
            </>
          )
        }
      >
        {requested ? (
          /* Why nothing happened, and what to do instead. A dialog that just
             closed would read as a plan change that silently failed. */
          <div className="flex flex-col gap-[14px]">
            <div className="flex items-start gap-[12px] rounded-[12px] border border-solid border-[#f5b800] bg-[#fffaeb] p-[14px]">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden
                className="mt-[1px] shrink-0"
              >
                <circle cx="10" cy="10" r="7.5" stroke="#b58600" strokeWidth="1.6" />
                <path
                  d="M10 6.4v4.2"
                  stroke="#b58600"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="10" cy="13.4" r="1" fill="#b58600" />
              </svg>
              <p className="text-[14px] leading-[1.6] text-[#7a5c00]">
                Your plan has <span className="font-semibold">not</span> been changed. Paying
                for a plan online is not available yet, so plan changes are still made by
                hand.
              </p>
            </div>

            <div className="flex items-center justify-between gap-[12px] rounded-[12px] border border-solid border-[#eaeaea] bg-white p-[12px]">
              <span className="flex min-w-0 flex-col gap-[2px]">
                <span className="text-[12px] text-[#8f8d87]">You asked for</span>
                <span className="text-[15px] font-semibold text-[#1e1e1e]">
                  {requested.name}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-semibold whitespace-nowrap text-[#1e1e1e]">
                ৳{requested.price.toLocaleString("en-IN")}
                <span className="text-[12px] font-medium text-[#8f8d87]">
                  /{requested.interval.toLowerCase() === "yearly" ? "yr" : "mo"}
                </span>
              </span>
            </div>

            <p className="text-[13px] leading-[1.7] text-[#525252]">
              Get in touch with us with your company name and the plan above, and we will
              move you across. You will keep {subscription.planName || subscription.plan}{" "}
              and everything on it until then.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {/* Usage against the ceiling, in one line rather than a paragraph.
                It is the reason somebody opened this dialog, so it is worth
                showing; the sentence explaining what a plan is was not. */}
            <div className="flex flex-wrap gap-x-[16px] gap-y-[4px] text-[13px] text-[#525252]">
              {(
                [
                  ["Branches", "max_branches"],
                  ["People", "max_users"],
                  ["Products", "max_products"],
                ] as const
              ).map(([label, key]) => (
                <span key={key}>
                  {label}{" "}
                  <span className="font-medium text-[#1e1e1e]">
                    {subscription.usage?.[key] ?? 0} / {limitText(subscription.limits?.[key])}
                  </span>
                </span>
              ))}
            </div>

            <div className="flex max-h-[340px] flex-col gap-[8px] overflow-y-auto">
              {offered.length === 0 && (
                <span className="text-[13px] text-[#8f8d87]">Loading plans…</span>
              )}
              {offered.length > 0 && !offered.some((o) => o.allowed) && (
                // Not silence: a dialog with nothing selectable and no reason
                // reads as broken rather than as "you are already on the top
                // plan".
                <span className="text-[13px] text-[#8f8d87]">
                  Nothing above your current plan. Contact us to change it.
                </span>
              )}
              {offered.map(({ plan, allowed, why }) => (
                <button
                  key={plan.code}
                  type="button"
                  disabled={!allowed}
                  onClick={() => setChosen(plan.code)}
                  className={`flex cursor-pointer items-center justify-between gap-[12px] rounded-[12px] border border-solid p-[12px] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                    chosen === plan.code
                      ? "border-[#f5b800] bg-[#fffdf5]"
                      : "border-[#eaeaea] bg-white hover:bg-[#fafafa]"
                  }`}
                >
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="text-[15px] font-semibold text-[#1e1e1e]">{plan.name}</span>
                    <span className="text-[12px] leading-[1.5] text-[#8f8d87]">
                      {limitText(plan.limits?.max_branches)} branches ·{" "}
                      {limitText(plan.limits?.max_users)} people ·{" "}
                      {limitText(plan.limits?.max_products)} products
                      {why ? ` · ${why}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold whitespace-nowrap text-[#1e1e1e]">
                    ৳{plan.price.toLocaleString("en-IN")}
                    <span className="text-[12px] font-medium text-[#8f8d87]">
                      /{plan.interval.toLowerCase() === "yearly" ? "yr" : "mo"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** The plan somebody is on. Informational, so it is the first thing dropped. */
export function UpgradePlanChip() {
  const { user: session } = useSession();
  const subscription = session?.subscription ?? null;
  if (!subscription) return null;
  const planLabel = subscription.planName || subscription.plan;
  return (
    <span
      title={`Current plan: ${planLabel}`}
      className="hidden h-[48px] shrink-0 items-center gap-[8px] rounded-[12px] border border-[#e5e5e5] bg-white px-[14px] text-[14px] font-medium whitespace-nowrap text-[#525252] lg:flex"
    >
      <PlanIcon />
      {planLabel}
    </span>
  );
}

/**
 * The bar trigger — the one in the header from md up.
 *
 * Renders nothing without `billing.manage`: a button that opens a dialog whose
 * every option is refused is worse than no button.
 */
export function UpgradeBarButton({ onClick }: { onClick: () => void }) {
  const { user: session } = useSession();
  const mayManage = session?.permissions.includes("billing.manage") ?? false;
  const subscription = session?.subscription ?? null;
  if (!mayManage) return null;
  const planLabel = subscription ? subscription.planName || subscription.plan : "";
  return (
    <button
      type="button"
      onClick={onClick}
      title={planLabel ? `On ${planLabel}` : "Change plan"}
      className="flex h-[48px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[12px] border border-[#f5b800] bg-[#fffaeb] px-[14px] text-[14px] font-semibold whitespace-nowrap text-[#b58600] transition-colors hover:bg-[#fff4d6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b800]"
    >
      <UpgradeIcon />
      Upgrade
    </button>
  );
}

/**
 * A row for the account menu, on a phone.
 *
 * Laid out like the Settings and Log Out rows beside it. The plan name rides
 * along on the right — the chip that carried it in the header has no room, and
 * "Upgrade" with no idea what you are on is half a sentence.
 */
export function UpgradeMenuItem({ onClick }: { onClick: () => void }) {
  const { user: session } = useSession();
  const mayManage = session?.permissions.includes("billing.manage") ?? false;
  const subscription = session?.subscription ?? null;
  if (!mayManage) return null;
  const planLabel = subscription ? subscription.planName || subscription.plan : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-[10px] px-[16px] py-[10px] text-left text-[13px] font-medium text-[#b58600] transition-colors hover:bg-[#fffaeb]"
    >
      <span className="flex items-center gap-[8px]">
        <UpgradeIcon />
        Upgrade
      </span>
      {planLabel && (
        <span className="truncate text-[12px] font-normal text-[#8a8a8a]">{planLabel}</span>
      )}
    </button>
  );
}
