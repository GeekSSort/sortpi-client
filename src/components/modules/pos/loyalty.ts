/**
 * The shop's points scheme, as the till reads it.
 *
 * Every rule comes from Settings. Nothing here decides anything — this is the
 * same arithmetic the server does, repeated on the client for ONE reason: to
 * show a cashier what will happen before they ring it up. The server validates
 * every redemption again and refuses one that breaks a rule, so a disagreement
 * between the two is a bug that surfaces as a refusal, never as a wrong sale.
 *
 * Kept in step with `apps/partners/loyalty.py` deliberately, function for
 * function. If one changes, the other has to.
 */

export interface LoyaltyRules {
  enabled: boolean;
  /** "Every ৳100 = 10 points" is these two together. */
  earnPerAmount: number;
  earnPoints: number;
  /** FLAT: a fixed amount per block. PERCENT: a share of the bill per block. */
  redeemMode: "FLAT" | "PERCENT";
  redeemPoints: number;
  redeemValue: number;
  redeemPercent: number;
  minRedeemPoints: number;
  allowPartialRedeem: boolean;
  /** 0 means no ceiling. */
  maxRedeemPerSale: number;
}

const num = (raw: unknown, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

/** The scheme, from the resolved settings map the till already holds. */
export function readLoyaltyRules(values: Record<string, string> | undefined): LoyaltyRules {
  const v = values ?? {};
  return {
    enabled: String(v["loyalty.enabled"] ?? "false") === "true",
    earnPerAmount: num(v["loyalty.earn_per_amount"], 100),
    earnPoints: num(v["loyalty.earn_points"], 10),
    redeemMode: String(v["loyalty.redeem_mode"] ?? "FLAT") === "PERCENT" ? "PERCENT" : "FLAT",
    redeemPoints: num(v["loyalty.redeem_points"], 100),
    redeemValue: num(v["loyalty.redeem_value"], 50),
    redeemPercent: num(v["loyalty.redeem_percent"], 1),
    minRedeemPoints: num(v["loyalty.min_redeem_points"], 100),
    allowPartialRedeem: String(v["loyalty.allow_partial_redeem"] ?? "false") === "true",
    maxRedeemPerSale: num(v["loyalty.max_redeem_per_sale"], 0),
  };
}

/** Whether the scheme can give anything back at all. */
function paysOut(r: LoyaltyRules): boolean {
  if (r.redeemPoints <= 0) return false;
  return r.redeemMode === "PERCENT" ? r.redeemPercent > 0 : r.redeemValue > 0;
}

/** Whole blocks inside a figure. 380 points is 3 blocks of 100; 80 stay put. */
export function blocksIn(r: LoyaltyRules, points: number): number {
  if (!paysOut(r) || points <= 0) return 0;
  return Math.floor(points / r.redeemPoints);
}

/**
 * How many points a spend earns. Rounded DOWN, always — a shop promising
 * "every ৳100" that pays out on ৳99 is running a different scheme from the one
 * on its poster.
 */
export function pointsForSpend(r: LoyaltyRules, spend: number): number {
  if (!r.enabled || spend <= 0) return 0;
  if (r.earnPerAmount <= 0 || r.earnPoints <= 0) return 0;
  return Math.floor(spend / r.earnPerAmount) * r.earnPoints;
}

/**
 * What spending `points` takes off a bill of `payable`.
 *
 * PERCENT needs the bill — "100 points = 1% off" is worth more on a bigger
 * basket — and is capped at 100%, so points take a sale to zero and never
 * below it.
 */
export function discountForPoints(r: LoyaltyRules, points: number, payable: number): number {
  if (!r.enabled || points <= 0 || !paysOut(r)) return 0;
  if (r.redeemMode === "PERCENT") {
    const percent = Math.min(100, blocksIn(r, points) * r.redeemPercent);
    return round2(Math.max(0, payable) * (percent / 100));
  }
  if (r.allowPartialRedeem) return round2((points * r.redeemValue) / r.redeemPoints);
  return round2(blocksIn(r, points) * r.redeemValue);
}

/**
 * The most of a balance this sale can actually take.
 *
 * Three ceilings: the shop's per-sale cap, the BILL, and the floor — which is
 * a gate rather than a ceiling, so under it none of them can be spent at all.
 * Always a figure the redemption rules can honour, so a cashier is never shown
 * a number that buys less than it looks like it should.
 */
export function redeemablePoints(r: LoyaltyRules, balance: number, payable: number): number {
  if (!r.enabled || balance <= 0 || payable <= 0 || !paysOut(r)) return 0;
  if (balance < r.minRedeemPoints) return 0;

  let allowed = balance;
  if (r.maxRedeemPerSale > 0) allowed = Math.min(allowed, r.maxRedeemPerSale);

  if (r.redeemMode === "PERCENT") {
    // The ceiling is 100% of the bill, not the bill: a block buys a share.
    const maxBlocks = Math.floor(100 / r.redeemPercent);
    allowed = Math.min(Math.floor(allowed / r.redeemPoints), maxBlocks) * r.redeemPoints;
  } else {
    const perPoint = r.redeemValue / r.redeemPoints;
    if (perPoint <= 0) return 0;
    allowed = Math.min(allowed, Math.floor(payable / perPoint));
    if (!r.allowPartialRedeem) {
      allowed = Math.floor(allowed / r.redeemPoints) * r.redeemPoints;
    }
  }

  return allowed >= r.minRedeemPoints ? allowed : 0;
}

/** Two places, as money is quoted. Kept off the float's tail. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
