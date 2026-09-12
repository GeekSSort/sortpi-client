"use client";

import React, { useRef, useState } from "react";
import { PurchaseService, type PurchaseImportReport } from "@/services";
import { invalidate } from "@/lib/query/useQuery";

/**
 * Upload a supplier's invoice as a spreadsheet.
 *
 * ONE component, used by the Purchases list and by the Add Purchase screen, so
 * the two cannot disagree about what a valid file is. The difference between
 * them is what happens AFTER: the list builds a purchase header around the
 * lines, the add screen puts them in the table it already has. Neither is this
 * component's business — it hands the caller the resolved lines and stops.
 *
 * TWO STEPS, ALWAYS. The file is CHECKED first, which writes nothing at all,
 * and the report is shown before anything is created. A shopkeeper uploading a
 * file they are unsure about should be able to find out without having
 * invented eleven products in the catalogue.
 *
 * Every message here is written for somebody who opened a spreadsheet. There
 * is no place in this component for an API error code.
 */

export interface PurchaseImportProps {
  /** Handed the resolved lines once the import is committed. */
  onImported: (report: PurchaseImportReport) => void;
  /** Shown under the heading — each screen says what happens next in its own words. */
  intro?: string;
  /** The label on the commit button, since the two screens do different things. */
  confirmLabel?: string;
  busy?: boolean;
}

/** The columns the server's template writes, in the order it writes them. */
const COLUMNS: { name: string; required: boolean; note: string }[] = [
  { name: "product", required: true, note: "What the item is called, e.g. Coca-Cola" },
  { name: "variant", required: false, note: "The size or type, e.g. 500ml. Leave empty if there is only one." },
  { name: "quantity", required: true, note: "How many you are buying" },
  { name: "unit_cost", required: true, note: "What you pay the supplier for ONE" },
  { name: "tax_percent", required: false, note: "VAT on this line, e.g. 15. Leave empty for none." },
  { name: "discount", required: false, note: "Money off this line, in taka" },
  { name: "batch_no", required: false, note: "The supplier's batch, if the goods have one" },
  { name: "expiry_date", required: false, note: "2026-12-31, for goods that expire" },
  { name: "category", required: false, note: "Only used when the product is new to the shop" },
  { name: "unit", required: false, note: "Piece, Kilogram… only used for a new product" },
  { name: "sku", required: false, note: "Your own code, if you use one" },
  { name: "barcode", required: false, note: "The code on the packet" },
  { name: "selling_price", required: false, note: "What you will sell it for" },
];

function UploadIcon() {
  return (
    <svg className="block size-[22px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PANEL = "rounded-[12px] border border-solid border-[#eaeaea] bg-white p-[16px]";
const LINK =
  "cursor-pointer text-[13px] font-semibold text-[#b58600] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export default function PurchaseImport({
  onImported,
  intro,
  confirmLabel = "Import these items",
  busy = false,
}: PurchaseImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<PurchaseImportReport | null>(null);
  /** The whole file was rejected — not a CSV, empty, wrong columns. */
  const [fileError, setFileError] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const reset = () => {
    setReport(null);
    setFileError(null);
  };

  const readable = (error: unknown): string => {
    // Never the raw exception. The server writes these messages for a
    // shopkeeper; anything else that reaches here is ours to translate.
    const message = error instanceof Error ? error.message : "";
    return message && !/^\[|Error:/.test(message)
      ? message
      : "That file could not be read. Save it as CSV and try again.";
  };

  const check = async (chosen: File) => {
    setFile(chosen);
    reset();
    setChecking(true);
    try {
      setReport(await PurchaseService.importCsv(chosen, false));
    } catch (error) {
      setFileError(readable(error));
    } finally {
      setChecking(false);
    }
  };

  const commit = async () => {
    if (!file || !report || report.valid === 0) return;
    setImporting(true);
    setFileError(null);
    try {
      const done = await PurchaseService.importCsv(file, true);
      // Products and variants may have just been created, so every screen
      // built from the catalogue is stale — the till's wall included.
      if (done.newProducts || done.newVariants) invalidate("products", "inventory");
      onImported(done);
    } catch (error) {
      setFileError(readable(error));
    } finally {
      setImporting(false);
    }
  };

  const template = async () => {
    setDownloading(true);
    try {
      await PurchaseService.downloadTemplate();
    } catch {
      setFileError("The template could not be downloaded. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  };

  const HEADLINE = "This CSV file is not in the correct format.";
  const detail = (fileError ?? "").startsWith(HEADLINE)
    ? fileError!.slice(HEADLINE.length).trim()
    : fileError;

  const errors = report?.rows.filter((row) => row.status === "error") ?? [];
  const working = checking || importing || busy;

  return (
    <div className="flex flex-col gap-[14px]">
      {intro && <p className="text-[14px] leading-[1.6] text-[#525252]">{intro}</p>}

      {/* Pick a file. A big target rather than a bare file input, which on a
          phone is a 20px link somebody has to hit exactly. */}
      <div className={`${PANEL} flex flex-col items-center gap-[10px] py-[22px] text-center`}>
        <span className="text-[#f5b800]">
          <UploadIcon />
        </span>
        <p className="text-[14px] font-medium text-[#1e1e1e]">
          {file ? file.name : "Choose your CSV file"}
        </p>
        <p className="max-w-[420px] text-[12px] leading-[1.6] text-[#8f8d87]">
          Your file needs a heading row and one line per item. Not sure? Download the template
          below — it already has the right headings and two example rows.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            // Cleared so choosing the SAME file again re-runs the check. A
            // corrected spreadsheet usually keeps its name, and without this
            // the second upload is silently ignored.
            e.target.value = "";
            if (chosen) void check(chosen);
          }}
        />
        <div className="mt-[4px] flex flex-wrap items-center justify-center gap-[12px]">
          <button
            type="button"
            disabled={working}
            onClick={() => fileRef.current?.click()}
            className="flex h-[40px] cursor-pointer items-center justify-center rounded-[10px] bg-[#f5b800] px-[16px] text-[14px] font-semibold text-white transition-colors hover:bg-[#e5a612] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? "Checking…" : file ? "Choose another file" : "Choose CSV file"}
          </button>
          <button type="button" disabled={downloading} onClick={template} className={LINK}>
            {downloading ? "Preparing…" : "Download CSV template"}
          </button>
          <button type="button" onClick={() => setShowFormat((v) => !v)} className={LINK}>
            {showFormat ? "Hide the format" : "What should the file look like?"}
          </button>
        </div>
      </div>

      {/* The format, in full, on demand. Folded away by default because a
          shopkeeper with a working file does not need to read it. */}
      {showFormat && (
        <div className={`${PANEL} flex flex-col gap-[10px]`}>
          <p className="text-[14px] font-medium text-[#1e1e1e]">What the file should look like</p>
          <p className="text-[13px] leading-[1.6] text-[#525252]">
            The first line names the columns. Three are required — <b>product</b>,{" "}
            <b>quantity</b> and <b>unit_cost</b> — and the rest can be left empty or left out
            altogether.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-solid border-[#eaeaea]">
                  <th className="py-[6px] pr-[10px] text-[12px] font-semibold text-[#1e1e1e]">
                    Column
                  </th>
                  <th className="py-[6px] pr-[10px] text-[12px] font-semibold text-[#1e1e1e]">
                    Needed?
                  </th>
                  <th className="py-[6px] text-[12px] font-semibold text-[#1e1e1e]">What it is</th>
                </tr>
              </thead>
              <tbody>
                {COLUMNS.map((column) => (
                  <tr key={column.name} className="border-b border-solid border-[#f2f2f2]">
                    <td className="py-[6px] pr-[10px] font-mono text-[12px] text-[#1e1e1e]">
                      {column.name}
                    </td>
                    <td className="py-[6px] pr-[10px] text-[12px] text-[#525252]">
                      {column.required ? "Required" : "Optional"}
                    </td>
                    <td className="py-[6px] text-[12px] text-[#525252]">{column.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-[10px] bg-[#fafafa] p-[12px]">
            <p className="text-[12px] font-semibold text-[#525252]">Example</p>
            <pre className="mt-[6px] overflow-x-auto text-[12px] leading-[1.7] text-[#1e1e1e]">
{`product,variant,quantity,unit_cost
Coca-Cola,500ml,24,45
Basmati Rice 5kg,,10,620`}
            </pre>
          </div>
          <p className="text-[13px] leading-[1.6] text-[#525252]">
            If an item is not in your shop yet, it will be added for you — you do not need to
            create it first. If it is already there, it will be used as it is, and nothing is
            duplicated.
          </p>
        </div>
      )}

      {/* The file could not be read at all. */}
      {fileError && (
        <div
          role="alert"
          className="rounded-[12px] bg-[#fdeceb] px-[16px] py-[14px] text-[13px] leading-[1.7] text-[#a02620]"
        >
          <p className="font-semibold">This CSV file is not in the correct format.</p>
          {/* The server writes some of these messages leading with the SAME
              sentence, so printing both put it on screen twice. The heading is
              the constant; the detail is what is left after it. */}
          {detail && <p className="mt-[4px]">{detail}</p>}
          <p className="mt-[6px]">
            Download the template above, copy your items into it, and upload it again.
          </p>
        </div>
      )}

      {/* The file was read, and here is what is in it. */}
      {report && !fileError && (
        <div className={`${PANEL} flex flex-col gap-[12px]`}>
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="text-[14px] font-medium text-[#1e1e1e]">
              {report.total} row{report.total === 1 ? "" : "s"} read
            </span>
            <span className="inline-flex h-[24px] items-center rounded-[12px] bg-[#eaf7ef] px-[10px] text-[12px] font-semibold text-[#1f9d55]">
              {report.valid} ready
            </span>
            {report.failed > 0 && (
              <span className="inline-flex h-[24px] items-center rounded-[12px] bg-[#fdeceb] px-[10px] text-[12px] font-semibold text-[#c0392b]">
                {report.failed} need fixing
              </span>
            )}
          </div>

          {(report.newProducts > 0 || report.newVariants > 0) && (
            <p className="rounded-[10px] bg-[#fffdf5] px-[12px] py-[10px] text-[13px] leading-[1.7] text-[#8a6d00]">
              {report.newProducts > 0 && (
                <>
                  {report.newProducts} item{report.newProducts === 1 ? "" : "s"} in this file{" "}
                  {report.newProducts === 1 ? "is" : "are"} not in your shop yet and will be added.
                </>
              )}
              {report.newProducts > 0 && report.newVariants > 0 && " "}
              {report.newVariants > 0 && (
                <>
                  {report.newVariants} new size{report.newVariants === 1 ? "" : "s"} of{" "}
                  {report.newVariants === 1 ? "an item" : "items"} you already sell will be added.
                </>
              )}
            </p>
          )}

          {errors.length > 0 && (
            <div className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px]">
              <p className="text-[13px] font-semibold text-[#a02620]">
                These rows could not be read:
              </p>
              <ul className="mt-[6px] flex flex-col gap-[3px]">
                {errors.slice(0, 20).map((row) => (
                  <li key={row.line} className="text-[13px] leading-[1.6] text-[#a02620]">
                    Row {row.line}: {row.message}
                  </li>
                ))}
              </ul>
              {errors.length > 20 && (
                <p className="mt-[6px] text-[12px] text-[#a02620]">
                  …and {errors.length - 20} more.
                </p>
              )}
              <p className="mt-[8px] text-[13px] leading-[1.6] text-[#a02620]">
                {report.valid > 0
                  ? "You can import the rows that are fine and fix the rest later, or correct them now and upload the file again."
                  : "Please correct these rows and upload the file again."}
              </p>
            </div>
          )}

          {/* What is about to be imported, before anything is created. */}
          {report.valid > 0 && (
            <div className="max-h-[220px] overflow-y-auto rounded-[10px] border border-solid border-[#eaeaea]">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-[#fafafa]">
                  <tr>
                    {["Item", "Size", "Qty", "Unit cost"].map((head, i) => (
                      <th
                        key={head}
                        className={`px-[10px] py-[7px] text-[12px] font-semibold text-[#1e1e1e] ${
                          i > 1 ? "text-right" : ""
                        }`}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows
                    .filter((row) => row.status === "ok")
                    .map((row) => (
                      <tr key={row.line} className="border-t border-solid border-[#f2f2f2]">
                        <td className="px-[10px] py-[7px] text-[13px] text-[#1e1e1e]">
                          {row.product}
                          {row.newProduct && (
                            <span className="ml-[6px] inline-flex h-[18px] items-center rounded-[9px] bg-[#fff8e1] px-[6px] text-[11px] font-semibold text-[#8a6d00]">
                              new
                            </span>
                          )}
                        </td>
                        <td className="px-[10px] py-[7px] text-[13px] text-[#525252]">
                          {row.variant || "—"}
                          {row.newVariant && !row.newProduct && (
                            <span className="ml-[6px] inline-flex h-[18px] items-center rounded-[9px] bg-[#fff8e1] px-[6px] text-[11px] font-semibold text-[#8a6d00]">
                              new
                            </span>
                          )}
                        </td>
                        <td className="px-[10px] py-[7px] text-right text-[13px] tabular-nums text-[#525252]">
                          {row.quantity}
                        </td>
                        <td className="px-[10px] py-[7px] text-right text-[13px] tabular-nums text-[#525252]">
                          {row.unitCost}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            disabled={working || report.valid === 0}
            onClick={commit}
            className="flex h-[44px] cursor-pointer items-center justify-center rounded-[10px] bg-[#f5b800] px-[16px] text-[14px] font-semibold text-white transition-colors hover:bg-[#e5a612] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? "Importing…" : `${confirmLabel}${report.valid ? ` (${report.valid})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
