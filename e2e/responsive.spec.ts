import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Nothing may spill sideways, on any screen anybody actually uses.
 *
 * A page that overflows horizontally is the single most visible way a layout
 * breaks on a phone: the whole document slides under your thumb, the header
 * detaches from the content, and a control you need ends up past the right
 * edge with no way to reach it. It is also invisible from a desktop, which is
 * why several of these had been shipping — the till's customer screen pushed
 * the page to 820px wide on a 360px phone, and the branch switcher was simply
 * deleted below 640 rather than made to fit.
 *
 * Deliberately mechanical: it asserts a property of the layout, not a
 * screenshot, so it stays true as the design changes and fails only when
 * something genuinely does not fit. Chromatic (visual.spec.ts) covers how it
 * looks; this covers whether it fits.
 *
 * The API is not running for these — the storage state carries a signpost
 * cookie and no token — so every screen renders its failure state. That is the
 * harder case, not an easier one: an error or empty panel is exactly where a
 * layout most often forgets its padding.
 */

/** The three shapes worth testing, and why each one. */
const VIEWPORTS = [
  // The narrow end of what people actually carry. If it fits here it fits.
  { name: "phone", width: 360, height: 740 },
  // A tablet held upright: past `sm`, short of `lg`, so the menu is still a
  // drawer and the tables have started to show. The awkward middle.
  { name: "tablet-portrait", width: 768, height: 1024 },
  // A tablet on its side, and the smallest laptop. `lg` has just landed, so
  // the sidebar is in-flow and the page has to share the width with it.
  { name: "tablet-landscape", width: 1024, height: 768 },
] as const;

/** Signed out, and meant to be: the guard sends a signed-IN visitor away. */
const PUBLIC_ROUTES = ["/login", "/signup", "/forgot-password", "/verify-code"] as const;

const ROUTES = [
  "/dashboard",
  "/pos",
  "/sales-pos/sales",
  "/sales-pos/return",
  "/sales-pos/return/new",
  "/customers",
  "/customers/add",
  "/inventory",
  "/inventory/add",
  "/inventory/stock",
  "/inventory/stock/add",
  "/inventory/transfers",
  "/purchases",
  "/purchases/add",
  "/purchases/suppliers",
  "/purchases/suppliers/add",
  "/hrm",
  "/hrm/add",
  "/hrm/payroll",
  "/roles-permissions",
  "/roles-permissions/add",
  "/reports",
  "/discount",
  "/settings",
  "/settings/edit",
  "/platform",
  "/platform/companies",
  "/platform/subscriptions",
  "/platform/invoices",
  "/platform/plans",
  "/platform/staff",
  "/platform/roles",
] as const;

/** Settled enough to measure: two frames after the load event. */
async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  );
}

/**
 * Anything that reaches past the right edge of whatever is meant to contain it.
 *
 * NOT `documentElement.scrollWidth`, which was the first version of this and
 * proved nothing: `DashboardShell` puts `overflow-hidden` on its root, so on
 * every back-office page content wider than the window is CLIPPED rather than
 * scrolled and the document never grows. Widening an element to 1800px on the
 * settings page changed that measurement by zero — and clipped is worse than
 * scrolled, because the part off the edge cannot be reached at all.
 *
 * So each element is compared against its nearest ancestor that decides its
 * fate. An ancestor that scrolls horizontally (`overflow-x: auto | scroll`) is
 * fine — a wide table inside one is exactly the pattern these pages use on a
 * phone, and it is reachable. An ancestor that clips (`hidden` / `clip`), or
 * the viewport itself, is not: past that edge the content is gone.
 */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders: string[] = [];
    const over = new Set<Element>();

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // Not inside an icon. An `<svg>` root is `overflow: hidden` by default
      // and its paths routinely draw past the viewBox — that is how vector
      // clipping works, not a layout fault, and every icon on the page would
      // otherwise be reported as cut off.
      if (el.closest("svg")) continue;

      // What decides whether this element's right edge is reachable.
      //
      // Walk ALL the way up, not to the first clipping ancestor. The list
      // pages nest a clipping grid inside a scrolling wrapper — an
      // `overflow-clip` row inside `overflow-x-auto` — and stopping at the
      // clip meant measuring a 1128px table against a 768px window and calling
      // every header cell lost, when scrolling reaches all of them. What
      // matters is the tightest clip found BELOW the first scroller: that one
      // really does cut content off.
      let clipRight = Infinity;
      let scrollable = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll") {
          scrollable = true;
          break;
        }
        if (ox === "hidden" || ox === "clip") {
          clipRight = Math.min(clipRight, p.getBoundingClientRect().right);
        }
      }
      // Nothing scrolls above it, so the window is also a hard edge.
      const edge = scrollable ? clipRight : Math.min(clipRight, limit);
      // A pixel of slack: sub-pixel layout rounds either way.
      if (box.right > edge + 1) over.add(el);
    }

    // Second question, and the one the first cannot answer: does the PAGE
    // itself scroll sideways?
    //
    // `documentElement.scrollWidth` is no use — `DashboardShell` puts
    // `overflow-hidden` on its root, so the document never grows. Nor is the
    // clip walk above: the shell's column is `overflow-y-auto`, and CSS
    // computes the other axis of a non-visible overflow to `auto`, so it reads
    // as a legitimate horizontal scroller and everything inside it is
    // "reachable". It is reachable — by dragging the whole page sideways,
    // which is precisely the failure being tested for.
    //
    // The column holding <main> IS the page. The table wrappers are nested
    // deeper and scroll on purpose, so they are untouched by this.
    const column = document.querySelector("main")?.parentElement ?? null;
    for (const box of [document.documentElement, document.body, column]) {
      if (!box) continue;
      if (box.scrollWidth > box.clientWidth + 1) {
        offenders.push(
          `${box.tagName.toLowerCase()} scrolls sideways: ` +
            `content ${box.scrollWidth}px in ${box.clientWidth}px`
        );
      }
    }

    // The innermost cause only — a parent is wide because its child is.
    for (const el of over) {
      if (Array.from(el.children).some((c) => over.has(c))) continue;
      const cls = typeof el.className === "string" ? el.className.slice(0, 90) : "";
      const box = el.getBoundingClientRect();
      offenders.push(
        `${el.tagName.toLowerCase()}.${cls} → right:${Math.round(box.right)} (limit ${limit})`
      );
      if (offenders.length >= 6) break;
    }
    return { spill: offenders.length, limit, offenders };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    // The signed-out half. No stub, no session — and no assertion that the URL
    // held, because these are the pages a signed-in visitor is meant to be
    // sent away from.
    for (const route of PUBLIC_ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await page.goto(route);
        await settle(page);
        const { spill, limit, offenders } = await overflow(page);
        expect(
          spill,
          `${route} at ${vp.width}px does not fit (${spill} problem(s)) — either ` +
            `the page scrolls sideways, or content is clipped past the ${limit}px ` +
            `edge with no ancestor that scrolls to reach it:\n  ` +
            offenders.join("\n  ")
        ).toBe(0);
      });
    }

    test.describe("signed in", () => {
      test.beforeEach(async ({ page }) => {
        await stubApi(page);
      });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await page.goto(route);
        await settle(page);
        // Guards the test itself. Without the stub every protected route
        // bounced to /login and these assertions measured the sign-in card.
        expect(new URL(page.url()).pathname, `${route} redirected away`).toBe(route);
        const { spill, limit, offenders } = await overflow(page);
        expect(
          spill,
          `${route} at ${vp.width}px has ${spill} element(s) cut off past the ` +
            `${limit}px edge, unreachable because no ancestor scrolls:\n  ` +
            offenders.join("\n  ")
        ).toBe(0);
      });
    }
    });
  });
}

test.describe("the controls a phone must still reach", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("the branch switcher is in the drawer, and its list fits", async ({ page }) => {
    await page.goto("/dashboard");
    await settle(page);

    // Server-side state: every branch-scoped list answers differently once it
    // moves. It used to be `hidden sm:block` — no way to move it on a phone
    // and no sign it existed. It lives at the top of the drawer now, above the
    // menu it re-scopes.
    await page.getByRole("button", { name: /toggle navigation/i }).click();
    const branch = page.locator('button[aria-haspopup="listbox"]').first();
    await expect(branch).toBeVisible();

    // Open it: a right-anchored panel here would start at -36px and cut the
    // first third off every branch name.
    await branch.click();
    const panel = page.locator('[role="listbox"]').first();
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box, "branch list has no box").not.toBeNull();
    expect(box!.x, "branch list starts off the left edge").toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, "branch list runs past the right edge").toBeLessThanOrEqual(361);
  });

  test("Upgrade is in the account menu, above Settings", async ({ page }) => {
    await page.goto("/dashboard");
    await settle(page);

    // The header has no room for it on a phone, so it joined the other
    // whole-account actions rather than being hidden as it was before.
    await page.getByRole("button", { name: /account menu/i }).click();
    // Scoped to the header: the sidebar has a Settings link of its own, and an
    // unscoped match finds both.
    const header = page.getByRole("banner");
    const upgrade = header.getByRole("button", { name: /^upgrade/i });
    const settings = header.getByRole("link", { name: /^settings$/i });
    await expect(upgrade).toBeVisible();
    await expect(settings).toBeVisible();

    const up = await upgrade.boundingBox();
    const set = await settings.boundingBox();
    expect(up!.y, "Upgrade should sit above Settings").toBeLessThan(set!.y);

    // And it must actually OPEN. Asserting the row is visible was not enough:
    // the dialog used to live inside this dropdown, so opening it closed the
    // dropdown, which unmounted the dialog along with it. The button was
    // visible, correctly placed, and did nothing.
    await upgrade.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/move up a plan/i)).toBeVisible();
  });

  test("the whole menu is reachable in the drawer", async ({ page }) => {
    await page.goto("/dashboard");
    await settle(page);
    await page.getByRole("button", { name: /toggle navigation/i }).click();

    // Eleven rows, a logo and a footer want ~740px. The aside was
    // `overflow-hidden`, so on a short screen Settings and Log Out were cut
    // off with no way to scroll to them.
    const logout = page.getByRole("button", { name: /^log out$/i });
    await expect(logout).toBeVisible();
    await logout.scrollIntoViewIfNeeded();
    const box = await logout.boundingBox();
    expect(box, "Log Out has no box").not.toBeNull();
    expect(box!.y + box!.height, "Log Out sits below the fold and cannot be scrolled to")
      .toBeLessThanOrEqual(741);
  });
});

/**
 * A money box may not be typed past its ceiling, and may not fill with zeros.
 *
 * `clampToMax` collapses leading zeros, and that was not enough on its own: in
 * a CONTROLLED input, typing "0" into a box already holding "0" produces the
 * DOM value "00", which sanitises back to the "0" React is already holding.
 * React skips the re-render when state does not change, so nothing wrote "0"
 * back over the DOM's "00" and the zeros piled up on screen while the state
 * behind them stayed at zero — a filled-looking amount field, a Record payment
 * button that stayed grey, and no explanation.
 *
 * Driven through a real browser because that is the only place the bug exists:
 * the pure function was correct the whole time.
 */
test.describe("the record-a-payment dialog", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.goto("/customers/c-1");
    await settle(page);
    await page.getByRole("button", { name: /record payment/i }).click();
  });

  const amountBox = (page: Page) => page.getByRole("textbox", { name: /amount received/i });

  test("zeros cannot be piled up in the amount box", async ({ page }) => {
    // In a CONTROLLED input, typing "0" into a box holding "0" gives the DOM
    // "00", which sanitises back to the "0" React already has — so React skips
    // the render and nothing ever writes "0" back over the DOM. The zeros piled
    // up on screen while the state behind them stayed zero: a filled-looking
    // field, a grey Record payment button, and no explanation.
    await amountBox(page).pressSequentially("00000000");
    await expect(amountBox(page), "the box filled up with zeros").toHaveValue("0");
  });

  test("an amount over the balance is replaced by the balance", async ({ page }) => {
    await amountBox(page).pressSequentially("999999");
    await expect(amountBox(page)).toHaveValue("10000");
  });

  test("Max fills in the whole balance", async ({ page }) => {
    await page.getByRole("button", { name: /^max$/i }).click();
    await expect(amountBox(page)).toHaveValue("10000");
  });

  test("a four-decimal invoice is allocated exactly, not rounded up", async ({ page }) => {
    // The reported failure: "MAIN-26-000126 has 4338.5950 outstanding, less
    // than the 4338.6000 allocated to it". The dialog rounded its own spread to
    // paisa, which rounded UP past what the invoice owed, and nothing on the
    // screen could be adjusted to get out of it.
    await page.getByRole("button", { name: /^max$/i }).click();
    const lines = page.getByRole("textbox", { name: /^amount against/i });
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(1)).toHaveValue("4338.595");
  });

  test("the summary says what the payment does, not X of X", async ({ page }) => {
    await page.getByRole("button", { name: /^max$/i }).click();
    // "Allocated ৳10,000 of ৳10,000" was true of every amount anybody typed,
    // because the spread re-runs on each keystroke. It said nothing.
    await expect(page.getByText(/across 2 invoices/i)).toBeVisible();
    await expect(page.getByText(/of ৳10,000/i)).toHaveCount(0);
  });

  test("a full payment can actually be recorded", async ({ page }) => {
    await page.getByRole("button", { name: /^max$/i }).click();
    const save = page.getByRole("button", { name: /record payment/i }).last();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText(/recorded/i).first()).toBeVisible();
  });
});

/**
 * Where the bare domain lands, signed out.
 *
 * The apex exists so a new company can register; sending that visitor to a
 * sign-in form they cannot fill in put the one thing they came for behind a
 * link under the button. A company's own subdomain is the opposite case and
 * still opens on sign-in.
 */
test.describe("the front door", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the platform's root opens on sign-up", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    expect(new URL(page.url()).pathname).toBe("/signup");
  });

  test("a page other than the root still sends you to sign in, with next", async ({ page }) => {
    await page.goto("/customers");
    await settle(page);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/customers");
  });
});

/**
 * Pricing more than one page of products.
 *
 * The tick at the head of the discounts table selects THIS PAGE — sixteen
 * products — and nothing said so where it could be read. The only control that
 * priced more than a page was "Price all of <category>", and it was hidden
 * unless a category had been chosen: in the All Categories view, the view you
 * use to price the whole shop, there was no way to do it at all. Ticking the
 * header and setting 5% looked like it had priced everything and had priced
 * sixteen — which is why switching category showed products with no discount.
 */
test.describe("pricing the whole catalogue", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.goto("/discount");
    await settle(page);
  });

  test("the header tick takes the page, and says there is more", async ({ page }) => {
    await page.getByRole("button", { name: /select every product on this page/i }).click();

    // Sixteen of thirty — and the escape hatch has to be visible, because the
    // assumption that this meant "all" is the whole defect.
    await expect(page.getByText(/^16 selected$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /select all 30/i })).toBeVisible();
  });

  test("Select all reaches every matching product", async ({ page }) => {
    await page.getByRole("button", { name: /select every product on this page/i }).click();
    await page.getByRole("button", { name: /select all 30/i }).click();
    await expect(page.getByText(/^30 selected$/)).toBeVisible();
  });

  test("Price all is offered in the All Categories view", async ({ page }) => {
    // It used to appear only once a category had been chosen.
    await expect(page.getByRole("button", { name: /price all 30/i })).toBeVisible();
  });

  test("a discount set on everything survives a category switch", async ({ page }) => {
    await page.getByRole("button", { name: /price all 30/i }).click();
    await page.getByRole("textbox", { name: /discount|amount|percent/i }).first().fill("5");
    await page.getByRole("button", { name: /apply to 30/i }).click();

    // Beverages is a third of the catalogue and none of it was on page one.
    await page.getByRole("button", { name: /^beverages/i }).click();
    await expect(page.getByText("-5%").first()).toBeVisible();
  });
});

/**
 * The scanner beep is adjustable, per till.
 *
 * It was a fixed level. A level that carries across a shop floor with a fridge
 * and a queue is the wrong level on a desk in a quiet office, and the same
 * company has both — so this is stored per device, and the default reproduces
 * exactly what the till shipped with.
 */
test.describe("scanner beep volume", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.goto("/pos");
    await settle(page);
    await page.getByRole("button", { name: /scanner/i }).first().click();
  });

  test("the control is there, and starts at the shipped level", async ({ page }) => {
    const slider = page.getByRole("slider", { name: /beep volume/i });
    await expect(slider).toBeVisible();
    // The top. A scanner beep exists to be heard across a counter; shipping it
    // quiet and hoping somebody finds the control gets the one thing it is for
    // wrong by default.
    await expect(slider).toHaveValue("100");
    await expect(page.getByRole("button", { name: /^test$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /error tone/i })).toBeVisible();
  });

  test("moving it is remembered on this device", async ({ page }) => {
    const slider = page.getByRole("slider", { name: /beep volume/i });
    await slider.fill("50");
    await expect(page.getByText("50%")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("sp_scan_volume"))).toBe("0.5");

    // Survives a reload: a level set at the counter should still be set
    // tomorrow morning.
    await page.reload();
    await settle(page);
    await page.getByRole("button", { name: /scanner/i }).first().click();
    await expect(page.getByRole("slider", { name: /beep volume/i })).toHaveValue("50");
  });

  test("zero reads as Silent rather than 0%", async ({ page }) => {
    await page.getByRole("slider", { name: /beep volume/i }).fill("0");
    await expect(page.getByText(/^Silent$/)).toBeVisible();
  });
});

/**
 * Turning the beep up must actually make it louder.
 *
 * Asserting the slider moved proves nothing about the sound. The obvious
 * change — raise a gain from 0.7 to 1.0 — buys a fraction of a decibel,
 * because the oscillator was already near full scale. The real increase comes
 * from stacking partials and driving a compressor's makeup gain, so that is
 * what is measured: the nodes the page actually builds, and the gain it sets.
 */
test.describe("the beep really is louder at the top", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.addInitScript(() => {
      // Record what the audio graph is made of, per beep.
      const w = window as unknown as {
        __audio: { osc: number; comp: number; shaper: number; gains: number[] };
      };
      w.__audio = { osc: 0, comp: 0, shaper: 0, gains: [] };
      const Ctor = window.AudioContext;
      const proto = Ctor.prototype;
      const osc = proto.createOscillator;
      const comp = proto.createDynamicsCompressor;
      const gain = proto.createGain;
      const shaper = proto.createWaveShaper;
      proto.createWaveShaper = function (this: AudioContext) {
        w.__audio.shaper += 1;
        return shaper.call(this);
      };
      proto.createOscillator = function (this: AudioContext) {
        w.__audio.osc += 1;
        return osc.call(this);
      };
      proto.createDynamicsCompressor = function (this: AudioContext) {
        w.__audio.comp += 1;
        return comp.call(this);
      };
      proto.createGain = function (this: AudioContext) {
        const node = gain.call(this);
        // The bus gain is set directly; the tone envelopes are ramped.
        const desc = Object.getOwnPropertyDescriptor(AudioParam.prototype, "value");
        const set = desc?.set;
        if (set) {
          Object.defineProperty(node.gain, "value", {
            configurable: true,
            get: desc!.get,
            set(v: number) {
              w.__audio.gains.push(v);
              set.call(this, v);
            },
          });
        }
        return node;
      };
    });
    await page.goto("/pos");
    await settle(page);
    await page.getByRole("button", { name: /scanner/i }).first().click();
  });

  type Built = { osc: number; comp: number; shaper: number; gains: number[] };
  const reset = (page: Page) =>
    page.evaluate(() => {
      (window as unknown as { __audio: Built }).__audio = {
        osc: 0,
        comp: 0,
        shaper: 0,
        gains: [],
      };
    });
  const read = (page: Page) =>
    page.evaluate(() => (window as unknown as { __audio: Built }).__audio);

  test("turned down it is one plain tone, exactly as it always was", async ({ page }) => {
    await page.getByRole("slider", { name: /beep volume/i }).fill("35");
    await reset(page);
    await page.getByRole("button", { name: /^test$/i }).click();
    const built = await read(page);
    expect(built.osc, "the default should not have gained partials").toBe(1);
    expect(built.shaper, "no saturation at or below the shipped level").toBe(0);
  });

  test("at the top it stacks partials and saturates", async ({ page }) => {
    await reset(page);
    await page.getByRole("button", { name: /^test$/i }).click();
    const built = await read(page);
    expect(built.osc, "no extra partials — the top would be barely louder").toBe(5);
    expect(built.shaper, "no saturation — peaks get sliced, not folded").toBe(1);
    // (1 / 0.35) ** 1.8 ≈ 6.6× drive into the curve, which is what turns
    // headroom into harmonics. Raising a gain from 0.7 to 1.0 — the obvious
    // change — was a fraction of a decibel.
    const boost = Math.max(...built.gains);
    expect(boost, "the drive into the saturator is the loudness").toBeGreaterThan(5);
  });

  test("the error tone is louder still, and stays a different shape", async ({ page }) => {
    await reset(page);
    await page.getByRole("button", { name: /error tone/i }).click();
    const built = await read(page);
    // Two bursts of three: it must not be told apart from a sale by pitch
    // alone, because a noisy room takes pitch away first.
    expect(built.osc).toBe(10);
    expect(built.shaper).toBe(1);
  });
});
