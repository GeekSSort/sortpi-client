"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { BEEP_GAIN, ERROR_GAIN, drive, scanVolume } from "./scanSound";

/**
 * The till's barcode scanner.
 *
 * A USB scanner — a Yumite YT-100, a Zebra, almost anything under ৳5,000 — is a
 * KEYBOARD. It enumerates as an HID keyboard and types the code wherever the
 * cursor happens to be, then usually presses Enter. Nothing about it is visible
 * to a browser: WebHID refuses to claim any device that reports keyboard usage
 * (that block is what stops a web page keylogging you), and WebUSB and WebSerial
 * see nothing either while the scanner is in its default keyboard mode. So there
 * is no API that answers "is a scanner plugged in", and any indicator claiming to
 * know would be lying.
 *
 * What CAN be known is whether something is typing like a scanner: a human types
 * at 100–300ms a character and a scanner at 5–20ms, and no human types twelve
 * digits in under a fifth of a second. So a burst of fast keystrokes IS the
 * signal, and the status this exposes is honest about which of the two it is —
 * "a scanner has typed here" rather than "a scanner is connected".
 *
 * Two things follow from the scanner being a keyboard, and both were the bugs
 * this replaced:
 *
 *  1. It types into whatever has focus. Scanning while the cursor sat in the
 *     customer-search box put the barcode in the customer's name and rang up
 *     nothing. So this listens at the document, in the CAPTURE phase, and takes
 *     the burst back off whichever field caught the first characters.
 *  2. It does not always send Enter. Some are configured with no suffix at all,
 *     so a burst that simply STOPS is a completed scan too.
 */

/**
 * Anything slower than this between keys is a person typing, not a scanner.
 *
 * 60ms is deliberately loose. A cheap USB scanner sends a character every 5-15ms
 * and a Bluetooth one over a busy link can stretch to 40; a touch-typist at 90
 * words per minute is still around 130ms, and nobody sustains 60ms for the
 * length of a barcode. The looseness is what makes this work with a scanner
 * nobody here has ever held — which is the point, since every shop buys whatever
 * the market was selling that week.
 */
const MAX_GAP_MS = 60;
/** A burst that stops for this long is finished, Enter or no Enter. */
const SETTLE_MS = 90;
/** Shorter than this is a keyboard shortcut or a stray keypress, not a code. */
const MIN_LENGTH = 4;
/** Remembered per device: this till HAS a scanner, even before today's first scan. */
const SEEN_KEY = "sp_pos_scanner_seen";

export interface ScanEvent {
  code: string;
  /** Milliseconds from the first character to the last. */
  durationMs: number;
  /** Characters per second — a person cannot reach 30. */
  speed: number;
  /** Whether the scanner sent a Return suffix. Useful when one is misconfigured. */
  hadEnter: boolean;
  at: number;
}

/** One keystroke as it arrived, for the diagnostic panel. */
export interface RawKey {
  key: string;
  /** Milliseconds since the previous keystroke. */
  gap: number;
  /** Where it landed — an input, a button, the page itself. */
  target: string;
}

export type ScannerState = {
  /** A scan has been read on this device before — kept across reloads. */
  everSeen: boolean;
  /** A burst is being read right now. */
  reading: boolean;
  /** Scans read since this page loaded. */
  count: number;
  last: ScanEvent | null;
  /** What the till did with the last code, for the status line and the panel. */
  lastResult: { ok: boolean; message: string } | null;
  /**
   * Every keystroke the page has seen, newest last — NOT only the ones that
   * looked like a scan.
   *
   * The whole diagnosis turns on one question: is the scanner producing
   * keystrokes at all? If this stays empty through a scan, nothing reached the
   * browser and the problem is the device, its mode or the cable — no amount of
   * tuning here would help. If it fills up and no code is rung up, the reader
   * below rejected it, and `rejected` says why.
   */
  /** Why the last burst was not treated as a scan. */
  rejected: string | null;
};

const EMPTY: ScannerState = {
  everSeen: false,
  reading: false,
  count: 0,
  last: null,
  lastResult: null,
  rejected: null,
};

let state: ScannerState = EMPTY;

let loaded = false;
const listeners = new Set<() => void>();

function emit(next: Partial<ScannerState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/**
 * The keystroke log, on a channel of its own.
 *
 * It used to live in `state`, appended on EVERY keydown before any judgement —
 * so a thirteen-character barcode pushed thirteen store notifications through
 * `useSyncExternalStore` in the ~100ms the scan took, re-rendering the status
 * pill and the scanner panel thirteen times each, and copying the array
 * thirteen times. Nothing on the till renders from `raw` except the diagnostic
 * panel, which is closed.
 *
 * Same data, same limit, written the same way; only the notification is
 * separate, so the cost is paid by whoever is actually looking at it.
 */
let rawLog: RawKey[] = [];
const rawListeners = new Set<() => void>();

function pushRaw(key: RawKey): void {
  rawLog = [...rawLog.slice(-(RAW_LIMIT - 1)), key];
  rawListeners.forEach((l) => l());
}

function subscribeRaw(listener: () => void): () => void {
  rawListeners.add(listener);
  return () => rawListeners.delete(listener);
}

const SERVER_RAW: RawKey[] = [];

/**
 * The keystroke log, for the diagnostic panel and nothing else.
 *
 * Subscribing to this is subscribing to a re-render per keystroke, which is
 * why it is a separate hook rather than a field on `useScannerState()`.
 */
export function useScannerRaw(): RawKey[] {
  return useSyncExternalStore(subscribeRaw, () => rawLog, () => SERVER_RAW);
}

function subscribe(listener: () => void): () => void {
  // Read the remembered flag on the first subscribe, not during a render: the
  // server has no localStorage and the two would disagree on the first paint.
  if (!loaded) {
    loaded = true;
    try {
      if (window.localStorage.getItem(SEEN_KEY) === "1") {
        state = { ...state, everSeen: true };
        queueMicrotask(() => listeners.forEach((l) => l()));
      }
    } catch {
      // A browser that refuses storage just starts at "waiting".
    }
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_STATE: ScannerState = EMPTY;

/** How many keystrokes the panel keeps. A QR code can carry a long URL. */
const RAW_LIMIT = 120;

/** Start the next test from a clean panel. */
export function clearScannerLog(): void {
  rawLog = [];
  rawListeners.forEach((l) => l());
  emit({ rejected: null });
}

/** What the status chip and the check panel both read. */
export function useScannerState(): ScannerState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

/** Say how the last code was resolved, so the chip can show it. */
export function reportScanResult(ok: boolean, message: string): void {
  emit({ lastResult: { ok, message } });
}

/**
 * Two short tones, or one flat one. A cashier is looking at the customer, not
 * at the screen, so the till has to be audible.
 *
 * WebAudio rather than an audio file: no asset to ship, no autoplay policy to
 * fall foul of (the context is created inside a real keystroke), and it works
 * offline. Every call is wrapped — a browser with no audio must not take the
 * sale down with it.
 */
/**
 * How loud the till is, 0 to 1.
 *
 * It was 0.05 — five per cent — which is audible in a quiet office and
 * inaudible in a shop with a fan, a fridge and a queue. A scanner beep exists
 * to be heard without looking, so a beep nobody hears is the same as no beep:
 * the cashier turns to the screen to check, which is the thing it was meant to
 * save them.
 *
 * A separate, louder level for the failure tone. The two must not be told
 * apart only by pitch — that is exactly what a noisy room takes away — so the
 * one that means "stop, something is wrong" is the one that carries.
 */
/**
 * One AudioContext for the life of the page, created on first use.
 *
 * A context per beep is what this did, closed on a timer 800ms later. That is
 * fine at a leisurely pace and wrong at the pace a scanner actually works:
 * codes arrive faster than the timer, the contexts stack, and browsers cap how
 * many a page may hold — Chrome at six. Past the cap `new AudioContext()`
 * throws, the catch swallows it, and the till simply stops beeping with
 * nothing to show why. Reusing one also removes the per-scan setup cost from
 * the path this product is judged on.
 */
let audio: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (audio && audio.state !== "closed") return audio;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audio = new Ctor();
  return audio;
}

export function beep(ok: boolean): void {
  try {
    // Per till, and adjustable — the right level is a property of the counter
    // the machine stands on. Zero means silent, and the tone is not produced at
    // all rather than played at nothing, which also stops every scan waking the
    // audio hardware on a till somebody has deliberately quietened.
    const volume = scanVolume();
    if (volume <= 0) return;

    const ctx = audioContext();
    if (!ctx) return;
    // A context created before the first gesture starts suspended, and a
    // suspended context plays nothing. Scans are keystrokes, so by the time
    // this runs the page has been interacted with.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});

    const push = drive(volume);
    const base = ok ? BEEP_GAIN : ERROR_GAIN;
    // The oscillators themselves stop at the shipped amplitude. There is no
    // headroom above 1.0 and driving a square wave into it is not "louder", it
    // is crackle. Everything past the default comes from the two lines below.
    const level = base * Math.min(1, push);

    /**
     * Drive into a saturator, and take the output at just under full scale.
     *
     * Every arrangement of these parts was tried and measured. Raising the
     * oscillator gain does nothing — it was already near full scale. A big
     * makeup gain alone reached 6.5x the default but with peaks at 3.7, and
     * everything above 1.0 is hard-clamped by the sound card: that is not
     * loudness, it is crackle laid over the note. Putting a limiter after the
     * makeup gain then gave the gain straight back, landing at 2.3x.
     *
     * What works is to drive the signal hard into a tanh curve, which bounds
     * smoothly at ±1 instead of being sliced, and to take the result at 0.9.
     * The saturator IS the limiter, so nothing downstream has to claw the gain
     * back, and a square wave folded like this has an RMS close to its peak —
     * which is as loud as a beep can physically be on the device.
     *
     * Below the default none of this is built: a single clean tone, exactly
     * the sound the till has always made.
     */
    let chainInput: AudioNode;
    if (push > 1) {
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i += 1) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        // Hard enough that anything past a third of full scale is already
        // near the ceiling — this is what turns headroom into harmonics.
        curve[i] = Math.tanh(x * 3.5);
      }
      shaper.curve = curve;
      // No oversampling. Its anti-alias filters ring on a hard-saturated
      // square and the overshoot measured 1.23 — past full scale, so clamped
      // by the hardware, which is the crackle this chain exists to avoid.
      shaper.oversample = "none";

      // How hard the tones hit the curve. This is the slider, and past about
      // 1.0 on it the curve is fully saturated — the point where the device
      // has nothing more to give.
      const preGain = ctx.createGain();
      preGain.gain.value = Math.pow(push, 1.8);

      // Just under full scale, so the peaks the curve produces are never
      // clamped by the hardware.
      const out = ctx.createGain();
      out.gain.value = 0.9;

      preGain.connect(shaper);
      shaper.connect(out);
      out.connect(ctx.destination);
      chainInput = preGain;
    } else {
      const bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(ctx.destination);
      chainInput = bus;
    }

    /**
     * One tone, with an attack and a release.
     *
     * A square wave switched on and off at full level clicks at both ends, and
     * at this volume the click is louder than the note. Ramping in over a few
     * milliseconds and out again removes it, and is the difference between
     * "loud" and "harsh".
     */
    const tone = (frequency: number, start: number, length: number, share = 1) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + start;
      const peak = Math.max(0.0002, level * share);
      osc.type = "square";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.005);
      gain.gain.setValueAtTime(peak, at + length - 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain);
      gain.connect(chainInput);
      osc.start(at);
      osc.stop(at + length + 0.01);
    };

    /**
     * Stacked partials, past the default.
     *
     * Three tones carry appreciably more energy than one, and a compressor in
     * front of them turns that energy into level rather than into peaks. Below
     * the default it stays a single tone — that is the sound the till has
     * always made, and somebody turning the volume DOWN is not asking for a
     * different beep.
     */
    const rich = push > 1;

    if (ok) {
      // 3136Hz, not 1760Hz. Human hearing peaks around 3–4kHz — the same
      // amplitude up there is roughly ten decibels louder to the person
      // standing at the counter, which is a bigger win than anything the gain
      // could have given. It is also where every other shop's scanner sits.
      //
      // Longer when it is loud, too: below about 200ms the ear has not
      // finished integrating a sound, so the same tone held longer is heard as
      // louder for free.
      const length = rich ? 0.16 : 0.1;
      tone(3136, 0, length);
      if (rich) {
        // Partials either side of the fundamental. Five tones carry
        // appreciably more energy than one, and the limiter turns that energy
        // into level rather than into peaks.
        tone(1568, 0, length, 0.7);
        tone(2349, 0, length, 0.55);
        tone(4699, 0, length * 0.8, 0.45);
        tone(6272, 0, length * 0.6, 0.3);
      }
    } else {
      // Low and twice: an unknown barcode has to sound different from a sale,
      // and it must not be told apart from one by PITCH alone — a noisy room
      // takes pitch away first.
      for (const at of [0, 0.18]) {
        tone(392, at, rich ? 0.2 : 0.15);
        if (rich) {
          tone(196, at, 0.2, 0.8);
          tone(784, at, 0.2, 0.6);
          tone(1176, at, 0.16, 0.4);
          tone(1568, at, 0.12, 0.3);
        }
      }
    }
  } catch {
    // Silence is survivable. A failed sale is not.
  }
}

function isTypingTarget(node: EventTarget | null): node is HTMLInputElement {
  const el = node as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable
  );
}

/**
 * Listen for scans anywhere on the page.
 *
 * `onScan` is held in a ref, so a caller does not have to memoise it and the
 * listener is attached exactly once for the life of the till.
 */
export function useBarcodeScanner(
  onScan: (code: string, event: ScanEvent) => void,
): void {
  const handler = useRef(onScan);
  // In an effect, not in the render pass: a ref written during render is a
  // read that another concurrent render can miss.
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let buffer = "";
    let startedAt = 0;
    let lastKeyAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** The field the burst landed in, and what it held before it did. */
    let caught: {
      el: HTMLInputElement;
      value: string;
      start: number | null;
    } | null = null;

    const reset = () => {
      buffer = "";
      caught = null;
      if (timer) clearTimeout(timer);
      timer = null;
      if (state.reading) emit({ reading: false });
    };

    /** Put the field back the way the burst found it. */
    const restore = () => {
      if (!caught) return;
      const { el, value, start } = caught;
      if (el.isContentEditable) return;
      // React tracks the value on the DOM node, so setting `.value` alone is
      // reverted on the next render. The native setter plus an input event is
      // how you tell a controlled component the truth.
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      if (start !== null && el.setSelectionRange) {
        try {
          el.setSelectionRange(start, start);
        } catch {
          // A number or email input refuses selection ranges. Harmless.
        }
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const finish = (hadEnter: boolean) => {
      // Code 39 is often sent with its start/stop asterisks attached, and some
      // scanners are configured with an STX/ETX wrapper. Neither is part of the
      // number printed on the packet, and a lookup carrying them finds nothing.
      const code = buffer.replace(/^[\x02*]+/, "").replace(/[\x03*]+$/, "");
      const durationMs = Math.max(1, Math.round(lastKeyAt - startedAt));
      const speed = Math.round((code.length / durationMs) * 1000);
      if (code.length < MIN_LENGTH) {
        emit({
          rejected: `Only ${code.length} character${code.length === 1 ? "" : "s"} arrived together — too short to be a barcode.`,
        });
        return reset();
      }
      // Slow enough to have been typed. A burst only reaches here without a
      // suffix through the settle timer, and ringing up whatever somebody
      // happened to be typing is worse than asking them to press Enter.
      if (!hadEnter && speed < 20) {
        emit({
          rejected: `${code.length} characters in ${durationMs} ms (${speed}/sec) with no Enter at the end — read as typing, not a scan.`,
        });
        return reset();
      }

      restore();
      const event: ScanEvent = {
        code,
        durationMs,
        speed: Math.round((code.length / durationMs) * 1000),
        hadEnter,
        at: Date.now(),
      };
      reset();

      try {
        window.localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // The chip will just say "waiting" again after a reload.
      }
      emit({
        everSeen: true,
        count: state.count + 1,
        last: event,
        lastResult: null,
        rejected: null,
      });
      handler.current(code, event);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const now = performance.now();
      const gap = now - lastKeyAt;

      // Logged BEFORE any judgement, including the keys this reader ignores.
      // The panel's first question is "did anything arrive at all", and a log
      // that only recorded what already qualified as a scan could never answer
      // it — it would look identical whether the scanner was unplugged or its
      // output was being rejected here.
      const el = e.target as HTMLElement | null;
      pushRaw({
        key: e.key,
        gap: lastKeyAt === 0 ? 0 : Math.round(gap),
        target: el?.tagName ? el.tagName.toLowerCase() : "page",
      });

      // A scanner sends no modifiers. Anything held down is a person.
      if (e.ctrlKey || e.altKey || e.metaKey) return reset();

      // Enter is the usual suffix and Tab is the other one scanners ship with.
      // Neither is required — the settle timer below ends a code that has no
      // suffix at all — but when one arrives it ends the code immediately.
      if (e.key === "Enter" || e.key === "Tab") {
        // Only OUR burst. A cashier pressing Enter in a form is not a scan and
        // swallowing it would break every dialog on the page; Tab likewise has
        // to keep moving focus when a person presses it.
        if (buffer.length >= MIN_LENGTH && gap <= MAX_GAP_MS * 3) {
          e.preventDefault();
          e.stopPropagation();
          lastKeyAt = now;
          finish(true);
        } else {
          if (buffer.length > 0) {
            emit({
              rejected:
                `Enter arrived after ${buffer.length} character${buffer.length === 1 ? "" : "s"}` +
                `${gap > MAX_GAP_MS * 3 ? `, ${Math.round(gap)} ms later` : ""} — read as a` +
                ` keypress, not the end of a scan.`,
            });
          }
          reset();
        }
        return;
      }

      // Printable characters only, but ALL of them: Code 39 and Code 128 carry
      // hyphens, dots and slashes, and dropping those silently truncated codes
      // rather than failing them.
      if (e.key.length !== 1) return;

      if (buffer === "" || gap > MAX_GAP_MS) {
        // The first character of a possible burst. It is allowed through to
        // whatever has focus — this cannot yet be told from typing — and the
        // field is snapshotted so it can be put back if a scan is what it turns
        // out to be.
        buffer = e.key;
        startedAt = now;
        lastKeyAt = now;
        if (isTypingTarget(e.target)) {
          const el = e.target as HTMLInputElement;
          caught = {
            el,
            value: el.value,
            start:
              typeof el.selectionStart === "number" ? el.selectionStart : null,
          };
        } else {
          caught = null;
        }
      } else {
        buffer += e.key;
        lastKeyAt = now;
        if (buffer.length >= 3 && !state.reading) emit({ reading: true });
      }

      if (timer) clearTimeout(timer);
      // No Enter suffix: a burst that stops IS the end of the code.
      timer = setTimeout(() => finish(false), SETTLE_MS);
    };

    // Capture, so the burst is seen before a field's own handler acts on it.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (timer) clearTimeout(timer);
    };
  }, []);
}
