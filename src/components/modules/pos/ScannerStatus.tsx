"use client";

import React, { useEffect, useState } from "react";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { clearScannerLog, useScannerState } from "./useBarcodeScanner";
import {
  connectSerialScanner,
  disconnectSerialScanner,
  serialSupported,
  useSerialScanner,
} from "./useSerialScanner";

/**
 * Whether the till is hearing the scanner — Figma has no node for this; it is
 * here because a cashier whose scanner has quietly stopped working has no other
 * way to find out, and finds out during a queue.
 *
 * It reports what can honestly be known. A USB scanner is an HID KEYBOARD, and
 * no browser API will say whether one is plugged in: WebHID refuses to claim
 * keyboards on purpose, and in its default mode the device speaks no other
 * protocol. So the chip reports scan ACTIVITY, and says so in the panel rather
 * than showing a green light it cannot back up.
 */

function DotIcon({ className }: { className: string }) {
  return (
    <span className={`block size-[8px] shrink-0 rounded-full ${className}`} />
  );
}

const CARD =
  "rounded-[12px] bg-white p-[14px] shadow-[inset_0_0_0_1px_#eaeaea]";
const SECTION_TITLE =
  "text-[13px] leading-[1.4] font-medium tracking-[-0.26px] text-[#1e1e1e]";
const FOLD_SUMMARY =
  "group flex cursor-pointer list-none items-center gap-[8px] text-[13px] leading-[1.4] font-medium text-[#525252] transition-colors hover:text-[#1e1e1e]";

function PlugIcon() {
  return (
    <svg
      className="block size-[18px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="block size-[16px] shrink-0 transition-transform group-open:rotate-90"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 3.5L10.5 8L6 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const AGO = (at: number) => {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
};

/**
 * The status pill beside the search box.
 *
 * Deliberately the same height and radius as the field it stands next to: a
 * till is read at a glance from standing height, and two controls of different
 * sizes on one row read as two unrelated things rather than one strip of state.
 *
 * Green or red, and nothing in between. The panel behind it carries the
 * nuance — a serial port genuinely held open versus a keyboard scanner that can
 * only be inferred from typing speed — but the person at the counter needs one
 * question answered: can I scan or not.
 */
export function ScannerPill({ onClick }: { onClick: () => void }) {
  const scanner = useScannerState();
  const serial = useSerialScanner();
  const connected = serial.status === "connected" || scanner.everSeen;
  const reading = scanner.reading;

  return (
    <button
      type="button"
      onClick={onClick}
      title="Open the scanner panel"
      aria-label={`Scanner ${connected ? "connected" : "disconnected"}. Open the scanner panel.`}
      className={`flex h-[44px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[10px] px-[14px] text-[13px] leading-[1.4] font-medium tracking-[-0.26px] whitespace-nowrap transition-colors ${
        connected
          ? "bg-[#f2f9f5] text-[#16a34a] shadow-[inset_0_0_0_1px_rgba(22,163,74,0.25)] hover:bg-[#e9f5ee]"
          : "bg-[#fef6f5] text-[#ef4444] shadow-[inset_0_0_0_1px_rgba(239,68,68,0.25)] hover:bg-[#fdeeec]"
      }`}
    >
      <DotIcon
        className={
          reading ? "bg-[#3b82f6] animate-pulse" : connected ? "bg-[#16a34a]" : "bg-[#ef4444]"
        }
      />
      <span className="hidden sm:inline">
        {reading ? "Reading…" : connected ? "Device connected" : "Device disconnected"}
      </span>
      <span className="sm:hidden">{connected ? "Connected" : "Offline"}</span>
    </button>
  );
}

export default function ScannerPanel({
  open,
  onClose,
  onSubmitCode,
}: {
  open: boolean;
  onClose: () => void;
  /** Rings a code up, the same path a scan takes. */
  onSubmitCode: (code: string) => void | Promise<void>;
}) {
  const scanner = useScannerState();
  const serial = useSerialScanner();
  const [manual, setManual] = useState("");
  // The "2s ago" has to move on its own while the panel is open.
  const [, tick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const reading = scanner.reading;
  // A held serial port is the one case where "connected" is a FACT rather than
  // an inference from typing speed, so it outranks everything else on the chip.
  const wired = serial.status === "connected";
  const ready = wired || scanner.everSeen;
  const failed = scanner.lastResult?.ok === false;

  const dot = reading
    ? "bg-[#3b82f6] animate-pulse"
    : failed
      ? "bg-[#ef4444]"
      : ready
        ? "bg-[#16a34a]"
        : "bg-[#f5b800]";

  const explanation = wired
    ? "The till is holding this scanner's port open, so it will know the moment the cable is pulled."
    : scanner.everSeen
      ? "A scanner has typed into this till. A keyboard-mode scanner cannot be detected any other way, so this means activity rather than a live connection."
      : "Nothing has scanned here yet. Point the scanner at any barcode — this panel can stay open while you do.";

  const label = reading
    ? "Reading…"
    : failed
      ? "Not recognised"
      : wired
        ? "Scanner connected"
        : scanner.everSeen
          ? "Scanner ready"
          : "Waiting for a scan";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scanner"
      width={560}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={MODAL_PRIMARY}
            style={{ backgroundImage: GOLD_GRADIENT }}
          >
            Done
          </button>
        </div>
      }
    >
        <div className="flex flex-col gap-[14px]">
          {/* The state and the last code â the two things somebody with a
              working scanner opened this to see. */}
          <div
            className={`flex flex-col gap-[12px] rounded-[12px] p-[16px] ${
              ready ? "bg-[#f2f9f5]" : "bg-[#fdf7e6]"
            }`}
          >
            <div className="flex items-start gap-[10px]">
              <span className="mt-[7px]">
                <DotIcon className={dot} />
              </span>
              <div className="flex min-w-0 flex-col gap-[2px]">
                <p className="text-[16px] leading-[1.35] font-semibold tracking-[-0.32px] text-[#1e1e1e]">
                  {label}
                </p>
                <p className="text-[13px] leading-[1.5] text-[#525252]">
                  {explanation}
                </p>
              </div>
            </div>

            {scanner.last && (
              <div className="flex flex-col gap-[10px] rounded-[10px] bg-white p-[12px]">
                <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
                  <span className="font-mono text-[18px] leading-[1.25] font-medium tracking-[0.02em] break-all text-[#1e1e1e]">
                    {scanner.last.code}
                  </span>
                  <span className="text-[12px] whitespace-nowrap text-[#a3a3a3]">
                    {AGO(scanner.last.at)}
                  </span>
                </div>

                {scanner.lastResult && (
                  <p
                    className={`text-[13px] leading-[1.4] font-medium ${
                      scanner.lastResult.ok
                        ? "text-[#16a34a]"
                        : "text-[#ef4444]"
                    }`}
                  >
                    {scanner.lastResult.message}
                  </p>
                )}

                {/* The numbers that tell a scanner from somebody typing. */}
                <dl className="grid grid-cols-2 gap-[8px] border-t border-solid border-[#f2f2f2] pt-[10px] sm:grid-cols-4">
                  {[
                    ["Characters", String(scanner.last.code.length)],
                    ["Took", `${scanner.last.durationMs} ms`],
                    ["Speed", `${scanner.last.speed}/sec`],
                    ["Enter suffix", scanner.last.hadEnter ? "Yes" : "No"],
                  ].map(([term, value]) => (
                    <div key={term} className="flex flex-col gap-[1px]">
                      <dt className="text-[11px] leading-[1.4] tracking-[0.02em] text-[#a3a3a3] uppercase">
                        {term}
                      </dt>
                      <dd className="text-[14px] leading-[1.4] font-medium tabular-nums text-[#1e1e1e]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {scanner.last.speed < 25 && (
                  <p className="text-[12px] leading-[1.5] text-[#a66a00]">
                    That arrived slowly enough to have been typed â a scanner
                    normally reads a whole code in under 100 ms.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Serial scanners. Only where it can work: a browser without Web
              Serial would otherwise be offered a button that does nothing. */}
          {serialSupported() && (
            <div className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-[10px]">
                <div className="flex min-w-0 items-start gap-[10px]">
                  <span
                    className={`mt-[1px] ${wired ? "text-[#16a34a]" : "text-[#a3a3a3]"}`}
                  >
                    <PlugIcon />
                  </span>
                  <div className="flex min-w-0 flex-col gap-[1px]">
                    <p className={SECTION_TITLE}>Serial scanner</p>
                    <p className="text-[12px] leading-[1.5] text-[#525252]">
                      {wired
                        ? `Port open${serial.count > 0 ? ` · ${serial.count} read` : ""}`
                        : serial.status === "connecting"
                          ? "Opening the port…"
                          : "For a scanner in USB Virtual COM mode, which types nothing at all."}
                    </p>
                  </div>
                </div>
                {wired ? (
                  <button
                    type="button"
                    onClick={() => void disconnectSerialScanner()}
                    className={`${MODAL_GHOST} shrink-0`}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={serial.status === "connecting"}
                    onClick={() => void connectSerialScanner()}
                    className={`${MODAL_PRIMARY} shrink-0`}
                    style={{ backgroundImage: GOLD_GRADIENT }}
                  >
                    Connect scanner
                  </button>
                )}
              </div>
              {serial.error && (
                <p className="mt-[10px] rounded-[8px] bg-[#fdf7e6] px-[10px] py-[8px] text-[12px] leading-[1.6] whitespace-pre-line text-[#a66a00]">
                  {serial.error}
                </p>
              )}
            </div>
          )}

          {/* Key a code in by hand â the fallback when a scanner dies mid-queue. */}
          <form
            className={CARD}
            onSubmit={(e) => {
              e.preventDefault();
              const code = manual.trim();
              if (!code) return;
              setManual("");
              void onSubmitCode(code);
            }}
          >
            <label htmlFor="manual-barcode" className={SECTION_TITLE}>
              Key a code in
            </label>
            <div className="mt-[8px] flex gap-[8px]">
              <input
                id="manual-barcode"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="The digits printed under the bars"
                className="flex h-[44px] min-w-0 flex-1 items-center rounded-[10px] bg-white px-[12px] font-mono text-[14px] tracking-[0.02em] text-[#1e1e1e] outline-none shadow-[inset_0_0_0_1px_#eaeaea] placeholder:font-sans placeholder:tracking-normal placeholder:text-[#a3a3a3]"
              />
              <button
                type="submit"
                disabled={!manual.trim()}
                className={MODAL_PRIMARY}
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                Ring up
              </button>
            </div>
          </form>

          {/* Everything below is for a scanner that is NOT working, and stays
              folded away until it is. */}
          <details className={CARD}>
            <summary className={FOLD_SUMMARY}>
              <ChevronIcon />
              Nothing happens when I scan
            </summary>
            <div className="mt-[12px] flex flex-col gap-[12px] text-[13px] leading-[1.6] text-[#525252]">
              <ol className="flex list-decimal flex-col gap-[8px] pl-[18px]">
                <li>
                  <b className="font-medium text-[#1e1e1e]">
                    Does the scanner beep?
                  </b>{" "}
                  If it never beeps it is not reading the code. Most cheap
                  scanners are 1D only and are blind to QR codes — try a striped
                  barcode off any packet.
                </li>
                <li>
                  <b className="font-medium text-[#1e1e1e]">Does it type?</b>{" "}
                  Scan into the box above. If no characters appear, the scanner
                  is not in keyboard mode — use Connect scanner if it is a
                  serial one, or set it back to USB HID Keyboard with the
                  barcode in its manual.
                </li>
                <li>
                  <b className="font-medium text-[#1e1e1e]">
                    Does the code arrive but nothing is added?
                  </b>{" "}
                  Then no product carries that barcode yet. Put it on the
                  product under Products → Barcode.
                </li>
                <li>
                  Codes arriving split or truncated mean the scanner needs its
                  factory defaults restored, and a suffix of Enter (CR) set.
                </li>
              </ol>

              {/* Real diagnostic output. Useful exactly once, and noise after. */}
              <details>
                <summary className={FOLD_SUMMARY}>
                  <ChevronIcon />
                  Raw keystrokes
                  {scanner.raw.length > 0 && (
                    <span className="text-[#a3a3a3]">
                      ({scanner.raw.length})
                    </span>
                  )}
                </summary>
                <div className="mt-[10px] flex flex-col gap-[8px]">
                  <div className="flex items-start justify-between gap-[10px]">
                    <p className="text-[12px] leading-[1.5] text-[#525252]">
                      Every key the browser receives, newest last, with the gap
                      in milliseconds. Still empty while you scan means nothing
                      reached the browser at all.
                    </p>
                    <button
                      type="button"
                      onClick={() => clearScannerLog()}
                      className="shrink-0 cursor-pointer text-[12px] text-[#525252] underline underline-offset-2 transition-opacity hover:opacity-70"
                    >
                      Clear
                    </button>
                  </div>

                  {scanner.raw.length === 0 ? (
                    <p className="rounded-[8px] bg-[#fafafa] px-[12px] py-[10px] text-[12px] text-[#a3a3a3]">
                      No keystrokes yet.
                    </p>
                  ) : (
                    <div className="max-h-[120px] overflow-y-auto rounded-[8px] bg-[#fafafa] p-[8px]">
                      <div className="flex flex-wrap gap-[4px]">
                        {scanner.raw.map((k, i) => (
                          <span
                            key={i}
                            title={`landed on <${k.target}>`}
                            className="flex flex-col items-center rounded-[4px] bg-white px-[5px] py-[3px] font-mono text-[11px] leading-[1.3] shadow-[inset_0_0_0_1px_#eaeaea]"
                          >
                            <span className="text-[#1e1e1e]">
                              {k.key === " "
                                ? "␣"
                                : k.key.length === 1
                                  ? k.key
                                  : k.key.slice(0, 5)}
                            </span>
                            <span
                              className={`tabular-nums ${
                                k.gap > 60 ? "text-[#a66a00]" : "text-[#a3a3a3]"
                              }`}
                            >
                              {k.gap}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {scanner.rejected && (
                    <p className="rounded-[8px] bg-[#fdf7e6] px-[12px] py-[10px] text-[12px] leading-[1.5] text-[#a66a00]">
                      Keystrokes arrived but were not rung up.{" "}
                      {scanner.rejected}
                    </p>
                  )}
                </div>
              </details>
            </div>
          </details>
        </div>
    </Modal>
  );
}
