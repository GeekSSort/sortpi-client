import { test, expect } from "@playwright/test";

import { atPlanLimit } from "../src/services/authService";
import { snakeToCamelCase } from "../src/services/apiClient";

/**
 * Plan ceilings, and the key spelling that broke every one of them.
 *
 * `apiClient.snakeToCamelCase` walks the WHOLE response and cannot tell a
 * field name from a MAP KEY, so `subscription.limits.max_branches` reaches the
 * browser as `limits.maxBranches`. Everything that read the server's own
 * spelling got `undefined`.
 *
 * The visible symptom was two bugs wearing one cause: the Upgrade dialog
 * showed "Branches 0 / Unlimited" for a company on a 3-branch plan, and every
 * plan above it was greyed out as a downgrade — because an unknown ceiling was
 * being compared as if it were unlimited.
 *
 * These are pure functions, so no browser is driven; what is under test is the
 * arithmetic that decides whether a button is offered.
 */

/** A `/auth/me` subscription block, as the SERVER sends it. */
const SERVER_SUBSCRIPTION = {
  plan: "standard",
  plan_name: "Standard",
  status: "ACTIVE",
  limits: { max_branches: 3, max_users: 15, max_products: 20000 },
  usage: { max_branches: 3, max_users: 4, max_products: 120 },
};

/** The same map keys, rewritten the way `authService` normalises them back. */
function normalise<T>(raw: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    out[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = value;
  }
  return out;
}

test.describe("plan ceilings survive the camelCase round-trip", () => {
  test("the API's map keys really are rewritten in transit", () => {
    // The premise. If this ever stops being true the normalisation below is
    // dead code, and this test says so rather than passing quietly.
    const overTheWire = snakeToCamelCase<{ limits: Record<string, number> }>(
      SERVER_SUBSCRIPTION
    );
    expect(overTheWire.limits.max_branches).toBeUndefined();
    expect(overTheWire.limits.maxBranches).toBe(3);
  });

  test("normalising puts the server's own names back", () => {
    const overTheWire = snakeToCamelCase<{ limits: Record<string, number> }>(
      SERVER_SUBSCRIPTION
    );
    const limits = normalise(overTheWire.limits);
    expect(limits.max_branches).toBe(3);
  });

  test("a company at its branch ceiling is reported at it", () => {
    const overTheWire = snakeToCamelCase<any>(SERVER_SUBSCRIPTION);
    const subscription = {
      plan: "standard",
      planName: "Standard",
      status: "ACTIVE",
      limits: normalise<number | null>(overTheWire.limits),
      usage: normalise<number>(overTheWire.usage),
    };
    // 3 of 3 branches used.
    expect(atPlanLimit(subscription, "max_branches")).toBe(true);
    // 4 of 15 people.
    expect(atPlanLimit(subscription, "max_users")).toBe(false);
  });

  test("the un-normalised map reports NOTHING at its limit — the bug", () => {
    // Kept as a test rather than a comment: this is exactly what the app did,
    // and it is indistinguishable from "you have room" at every call site.
    const overTheWire = snakeToCamelCase<any>(SERVER_SUBSCRIPTION);
    const broken = { plan: "standard", planName: "S", status: "ACTIVE", ...overTheWire };
    expect(atPlanLimit(broken as never, "max_branches")).toBe(false);
  });

  test("null means unlimited and never blocks", () => {
    const subscription = {
      plan: "enterprise",
      planName: "Enterprise",
      status: "ACTIVE",
      limits: { max_branches: null, max_users: null, max_products: null },
      usage: { max_branches: 900, max_users: 900, max_products: 900 },
    };
    expect(atPlanLimit(subscription, "max_branches")).toBe(false);
  });

  test("no subscription at all is unmetered, not at the limit", () => {
    expect(atPlanLimit(null, "max_branches")).toBe(false);
    expect(atPlanLimit(undefined, "max_branches")).toBe(false);
  });
});
