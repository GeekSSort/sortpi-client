import { test, expect } from "@chromatic-com/playwright";
import type { Locator } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Asserts each design-system primitive against the measurements in Figma
 * node 77:20535. Chromatic catches *that* something looks different; this
 * catches *which* property drifted, and fails in CI without a human eye.
 *
 * Figma strokes are inside-aligned, so components use `outline` with a
 * negative offset rather than `border` — a border would add to the box and
 * push every card 2px past its Figma height.
 */
const css = (el: Locator, prop: string) =>
  el.evaluate((n, p) => getComputedStyle(n).getPropertyValue(p), prop);

const box = (el: Locator) =>
  el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });

const BRAND = "rgb(245, 184, 0)";
const MUTED = "rgb(82, 82, 82)";
const SURFACE = "rgb(234, 234, 234)";

test.beforeEach(async ({ page }) => {
  await page.goto("/ds-preview");
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);
});


/**
 * Every test here signs in against a stubbed API.
 *
 * Without it the guard sends each protected route to `/login?next=…`, and
 * these tests then measured the SIGN-IN CARD while claiming to measure the
 * dashboard, the sidebar and the design-system page. They passed or failed for
 * reasons unrelated to what they name — the same vacuity `responsive.spec.ts`
 * was written with and then corrected.
 */
test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

test("tokens resolve to the Figma values", async ({ page }) => {
  const swatches = page.locator("section", { hasText: "Colour" }).first();
  await expect(swatches).toBeVisible();

  // Type scale: Figma letter-spacing is a % of font size (Type@32 = -2%).
  const t32 = page.locator(".text-32").first();
  expect(await css(t32, "font-size")).toBe("32px");
  expect(await css(t32, "letter-spacing")).toBe("-0.64px");

  // Elevation, node 76:9714.
  expect(await css(page.locator(".shadow-e100").first(), "box-shadow")).toContain(
    "rgba(0, 0, 0, 0.1) 0px 6px 30px 0px"
  );
});

test("Button matches node 77:20763", async ({ page }) => {
  const btn = page.getByRole("button", { name: "Button", exact: true });
  expect(await box(btn)).toEqual({ w: 501, h: 56 });
  expect(await css(btn, "background-color")).toBe(BRAND);
  expect(await css(btn, "color")).toBe("rgb(255, 255, 255)");
  expect(await css(btn, "border-radius")).toBe("12px");
  expect(await css(btn, "font-size")).toBe("18px");
  expect(await css(btn, "font-weight")).toBe("600");
  // Figma sets 24px here, overriding the type token's 1.5 (=27px).
  expect(await css(btn, "line-height")).toBe("24px");
});

test("Field matches node 77:20751", async ({ page }) => {
  const input = page.locator("input").first();
  expect(await box(input)).toEqual({ w: 501, h: 56 });
  expect(await css(input, "background-color")).toBe(SURFACE);
  expect(await css(input, "color")).toBe(MUTED);
  expect(await css(input, "border-radius")).toBe("12px");
  expect(await css(input, "padding")).toBe("8px 16px");

  const label = page.locator("label").first();
  expect(await css(label, "font-size")).toBe("18px");
  expect(await css(label, "font-weight")).toBe("500");
  expect(await css(label, "line-height")).toBe("24px");

  // Focus state: white ground, brand hairline.
  await input.focus();
  expect(await css(input, "background-color")).toBe("rgb(255, 255, 255)");
  expect(await css(input, "border-top-color")).toBe(BRAND);
});

test("DateField matches nodes 77:20963 / 77:20965", async ({ page }) => {
  const solid = page.getByRole("button", { name: /24 August 2026/ }).first();
  const outline = page.getByRole("button", { name: /24 August 2026/ }).nth(1);

  // Both variants are 48px tall in Figma — the outlined one must not grow.
  expect((await box(solid)).h).toBe(48);
  expect((await box(outline)).h).toBe(48);

  expect(await css(solid, "background-color")).toBe(BRAND);
  expect(await css(solid, "color")).toBe("rgb(255, 255, 255)");
  expect(await css(outline, "color")).toBe(MUTED);
  expect(await css(outline, "outline-color")).toBe(MUTED);
  expect(await css(solid, "gap")).toBe("12px");
  expect(await css(solid, "padding")).toBe("12px 16px");
});

test("StatCard matches node 77:20923", async ({ page }) => {
  const card = page.locator(".w-\\[278px\\]").first();
  expect(await box(card)).toEqual({ w: 278, h: 143 });
  expect(await css(card, "background-color")).toBe("rgb(255, 255, 255)");
  expect(await css(card, "border-radius")).toBe("10px");
  expect(await css(card, "padding")).toBe("24px");
  expect(await css(card, "outline-color")).toBe(SURFACE);

  const title = card.locator("p").first();
  expect(await css(title, "font-size")).toBe("14px");
  expect(await css(title, "letter-spacing")).toBe("-0.28px");

  const value = card.locator("p").nth(1);
  expect(await css(value, "font-size")).toBe("20px");
  expect(await css(value, "color")).toBe("rgb(38, 38, 38)");
  expect(await css(value, "letter-spacing")).toBe("-0.4px");
});

test("ProductCard matches node 77:21022", async ({ page }) => {
  const card = page.locator('[class*="outline-\\[0.6px\\]"]').first();
  expect(await box(card)).toEqual({ w: 180, h: 248 });
  expect(await css(card, "border-radius")).toBe("10px");
  expect(await css(card, "padding")).toBe("10px");

  const price = card.locator("p").nth(1);
  expect(await css(price, "color")).toBe(BRAND);
  expect(await css(price, "font-size")).toBe("16px");
  expect(await css(price, "line-height")).toBe("24px");
});

test("Trend pill matches node 77:20918", async ({ page }) => {
  const pill = page.locator(".bg-positive-surface").first();
  expect((await box(pill)).h).toBe(24);
  expect(await css(pill, "background-color")).toBe("rgb(245, 255, 248)");
  expect(await css(pill, "border-radius")).toBe("17px");
  expect(await css(pill, "gap")).toBe("7px");
  expect(await css(pill, "padding")).toBe("0px 8px");
  expect(await box(pill.locator("span").first())).toEqual({ w: 6, h: 6 });

  const text = pill.locator("span").last();
  expect(await css(text, "color")).toBe("rgb(0, 184, 55)");
  expect(await css(text, "font-size")).toBe("12px");
  // Figma overrides the Type@12 token here: -0.24px, not -0.12px.
  expect(await css(text, "letter-spacing")).toBe("-0.24px");
});

test("spacing and gaps match the Figma frames", async ({ page }) => {
  const stat = page.locator(".w-\\[278px\\]").first();
  // Icon row gap 16, text column gap 10 (nodes 77:20902 / 77:20914).
  expect(await css(stat.locator("> div").first(), "gap")).toBe("16px");
  expect(await css(stat.locator("> div > div").first(), "gap")).toBe("10px");
  expect(await box(stat.locator("span").first())).toEqual({ w: 40, h: 40 });

  const product = page.locator('[class*="outline-\\[0.6px\\]"]').first();
  // Inner column gap 12, text column gap 8, image 160x160 (node 77:20982).
  expect(await css(product.locator("> div").first(), "gap")).toBe("12px");
  expect(await box(product.locator(".rounded-\\[8px\\]").first())).toEqual({ w: 160, h: 160 });

  // Field stacks label + input with an 8px gap (node 77:20751).
  expect(await css(page.locator("input").first().locator(".."), "gap")).toBe("8px");
});
