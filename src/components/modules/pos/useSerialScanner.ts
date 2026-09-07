"use client";

import { useSyncExternalStore } from "react";

/**
 * The other kind of barcode scanner: the one that speaks over a serial port.
 *
 * Most scanners pretend to be a keyboard, and `useBarcodeScanner` reads those.
 * Some are shipped in — or configured into — USB Virtual COM mode instead, where
 * the device enumerates as a serial port and writes the code down it as bytes.
 * Nothing is typed, so a keyboard reader hears nothing at all, and the till looks
 * broken while the scanner beeps happily: it IS reading, and its output is going
 * somewhere the page was never listening.
 *
 * Web Serial is what lets a page listen. Unlike the keyboard case this gives a
 * REAL connection state — the port is opened, held, and fires an event when the
 * cable is pulled — so the status this exposes is a fact rather than an
 * inference from typing speed.
 *
 * Three things it costs, all of them one-time:
 *
 *  - Chrome or Edge. Firefox and Safari have not shipped Web Serial.
 *  - A click. `requestPort()` must be called from a real user gesture, and the
 *    browser shows its own device chooser. After that the grant is remembered
 *    and the port reopens by itself on the next visit.
 *  - On Linux, permission on the device node: a serial port is `root:dialout`,
 *    so the user has to be in the `dialout` group or Chrome cannot open it. The
 *    panel says so when the open fails, because "failed to open" on its own
 *    sends people to the wrong place.
 *
 * The baud rate is set to 9600 and does not matter for a USB CDC device — the
 * bytes cross USB, not a UART, and the line setting is decoration. It matters
 * only for a true RS-232 scanner behind a USB-serial cable.
 */

/* ── Minimal Web Serial types ──────────────────────────────────────────────
   TypeScript's DOM library does not declare these, and `any` would take the
   type checking off the read loop, which is the part worth checking. */

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
}

interface SerialLike extends EventTarget {
  requestPort(options?: {
    filters?: { usbVendorId?: number }[];
  }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

function serialApi(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { serial?: SerialLike }).serial ?? null;
}

export type SerialStatus =
  "unsupported" | "idle" | "connecting" | "connected" | "error";

export interface SerialState {
  status: SerialStatus;
  /** What went wrong, in words a shopkeeper can act on. */
  error: string | null;
  /** Codes read down the port since the page loaded. */
  count: number;
}

const EMPTY: SerialState = { status: "idle", error: null, count: 0 };
let state: SerialState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: Partial<SerialState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSerialScanner(): SerialState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

export function serialSupported(): boolean {
  return serialApi() !== null;
}

/** Where a code goes once it has been read off the port. */
let handler: (code: string) => void = () => {};
let port: SerialPortLike | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let closing = false;

/** A code with no terminator is finished when the bytes stop. */
const FLUSH_MS = 120;

async function readLoop(): Promise<void> {
  if (!port?.readable) return;
  const decoder = new TextDecoder();
  let buffer = "";
  let flush: ReturnType<typeof setTimeout> | null = null;

  const deliver = (raw: string) => {
    // Code 39 start/stop asterisks and STX/ETX wrappers are framing, not part
    // of the number printed on the packet.
    const code = raw
      .trim()
      .replace(/^[\x02*]+/, "")
      .replace(/[\x03*]+$/, "");
    if (code.length < 2) return;
    emit({ count: state.count + 1 });
    handler(code);
  };

  reader = port.readable.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Most scanners end a code with CR, LF or both. Split on either, and
      // never on a fixed pair — a scanner sending only CR would otherwise
      // deliver nothing until the next scan pushed it out.
      let index = buffer.search(/[\r\n]/);
      while (index >= 0) {
        deliver(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.search(/[\r\n]/);
      }

      // No terminator configured: the pause IS the terminator.
      if (flush) clearTimeout(flush);
      if (buffer) {
        flush = setTimeout(() => {
          const rest = buffer;
          buffer = "";
          deliver(rest);
        }, FLUSH_MS);
      }
    }
  } catch (err) {
    if (!closing) {
      emit({
        status: "error",
        error:
          err instanceof Error
            ? err.message
            : "The scanner stopped responding.",
      });
    }
  } finally {
    if (flush) clearTimeout(flush);
    try {
      reader.releaseLock();
    } catch {
      // Already released by a close racing this loop.
    }
    reader = null;
  }
}

async function open(candidate: SerialPortLike): Promise<void> {
  emit({ status: "connecting", error: null });
  try {
    await candidate.open({ baudRate: 9600 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The Linux case, named. "Failed to open serial port" on its own sends a
    // shopkeeper to the scanner, and the scanner is fine.
    const denied = /access|denied|permission|busy/i.test(message);
    emit({
      status: "error",
      error: denied
        ? "The browser was not allowed to open the port. On Linux the user has to be in " +
          "the 'dialout' group: run  sudo usermod -aG dialout $USER  then log out and back in. " +
          "Also check nothing else is holding the port open."
        : message,
    });
    return;
  }
  port = candidate;
  closing = false;
  emit({ status: "connected", error: null });
  void readLoop().then(() => {
    // The loop ends when the port closes or the cable is pulled.
    if (!closing && state.status === "connected") {
      emit({ status: "idle", error: "The scanner was disconnected." });
    }
    port = null;
  });
}

/** Ask the browser for a port. MUST be called from a click. */
export async function connectSerialScanner(): Promise<void> {
  const serial = serialApi();
  if (!serial) {
    emit({
      status: "unsupported",
      error: "This browser cannot open serial ports. Chrome or Edge can.",
    });
    return;
  }
  try {
    const chosen = await serial.requestPort();
    await open(chosen);
  } catch (err) {
    // A cancelled chooser is not an error worth shouting about.
    const message = err instanceof Error ? err.message : String(err);
    if (/no port selected|cancell?ed/i.test(message)) {
      emit({ status: "idle", error: null });
      return;
    }
    emit({ status: "error", error: message });
  }
}

export async function disconnectSerialScanner(): Promise<void> {
  closing = true;
  try {
    await reader?.cancel();
  } catch {
    // The loop is already unwinding.
  }
  try {
    await port?.close();
  } catch {
    // Closing a port that is already gone is not a failure.
  }
  port = null;
  emit({ status: "idle", error: null });
}

/**
 * Reopen a port the user has already granted, and watch for the cable.
 *
 * Called once by the till. The grant survives a reload, so a shop that
 * connected the scanner yesterday should not have to click anything today —
 * which is the difference between a feature and a chore.
 */
export function initSerialScanner(onCode: (code: string) => void): () => void {
  handler = onCode;
  const serial = serialApi();
  if (!serial) {
    emit({ status: "unsupported", error: null });
    return () => {};
  }

  void serial.getPorts().then((ports) => {
    if (ports.length > 0 && state.status === "idle") void open(ports[0]);
  });

  // A real connect/disconnect signal — the thing a keyboard-mode scanner can
  // never give us.
  const onConnect = () => {
    if (state.status === "idle" || state.status === "error") {
      void serial.getPorts().then((ports) => {
        if (ports.length > 0) void open(ports[0]);
      });
    }
  };
  const onDisconnect = () => {
    port = null;
    emit({ status: "idle", error: "The scanner was unplugged." });
  };

  serial.addEventListener("connect", onConnect);
  serial.addEventListener("disconnect", onDisconnect);
  return () => {
    serial.removeEventListener("connect", onConnect);
    serial.removeEventListener("disconnect", onDisconnect);
  };
}
