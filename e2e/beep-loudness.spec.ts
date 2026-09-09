import { test, expect } from "@playwright/test";
import { stubApi } from "./stubApi";

/**
 * The beep must actually be loud, and must not clip.
 *
 * Counting audio nodes proves the chain was built; it does not prove the sound
 * got louder. This renders the REAL graph offline and measures it, which is
 * how two earlier arrangements were caught: a large makeup gain reached 6.5x
 * but peaked at 3.7 — nearly four times what a sound card can represent, so
 * the hardware clamped it into crackle — and putting a limiter after that gain
 * handed the gain straight back, landing at 2.3x.
 *
 * Measured over the sounding part only. A second of mostly silence drags the
 * figure down and rewards the longer tone twice over.
 */
test.describe("the beep, measured", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.addInitScript(() => {
      const Offline = window.OfflineAudioContext;
      const w = window as unknown as { __ctx?: OfflineAudioContext };
      // `beep` reads window.AudioContext at call time and caches the instance,
      // so one offline context per page load is exactly one measurement.
      (window as unknown as { AudioContext: unknown }).AudioContext = function () {
        const ctx = new Offline(1, 44100, 44100);
        w.__ctx = ctx;
        return ctx;
      };
    });
  });

  const measure = async (page: import("@playwright/test").Page, percent: string) => {
    await page.goto("/pos");
    await page.waitForLoadState("load");
    await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));
    await page.getByRole("button", { name: /scanner/i }).first().click();
    await page.getByRole("slider", { name: /beep volume/i }).fill(percent);
    await page.getByRole("button", { name: /^test$/i }).click();
    return page.evaluate(async () => {
      const ctx = (window as unknown as { __ctx?: OfflineAudioContext }).__ctx;
      if (!ctx) return null;
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < d.length; i += 1) peak = Math.max(peak, Math.abs(d[i]));
      const floor = peak * 0.05;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 1) {
        if (Math.abs(d[i]) < floor) continue;
        sum += d[i] * d[i];
        n += 1;
      }
      return { rms: n ? Math.sqrt(sum / n) : 0, peak, ms: Math.round((n / 44100) * 1000) };
    });
  };

  test("the top is near full scale, and never past it", async ({ page }) => {
    const quiet = await measure(page, "35");
    const loud = await measure(page, "100");
    expect(quiet, "nothing rendered at 35%").not.toBeNull();
    expect(loud, "nothing rendered at 100%").not.toBeNull();

    // Anything above 1.0 is hard-clamped by the sound card. That is not extra
    // loudness, it is crackle laid over the note.
    expect(loud!.peak, "the output clips — the saturator is not bounding it").toBeLessThan(1);
    // A square wave folded into a tanh curve has an RMS close to its peak.
    // Below this and the chain is leaving loudness on the table.
    expect(loud!.rms / loud!.peak, "not saturated: RMS should sit just under the peak")
      .toBeGreaterThan(0.9);
    // And it must be a real increase over the level the till used to have.
    expect(loud!.rms / quiet!.rms, "the top is not meaningfully louder").toBeGreaterThan(2);
    // Longer, too — under about 200ms the ear has not finished integrating a
    // sound, so the same tone held longer is heard as louder for free.
    expect(loud!.ms).toBeGreaterThan(quiet!.ms);
  });
});
