"use client";

import React from "react";
import Receipt from "@/components/shared/Receipt";
import { useShopProfile } from "@/components/shared/useShopProfile";
import type { Voucher } from "@/types/finance";

/**
 * The slip a voucher is printed on.
 *
 * The SAME `Receipt` component the till prints a sale with, and that is the
 * point: a shop's documents should look like one shop's documents. A
 * hand-rolled block here would be a second masthead to keep in step with the
 * company profile, and the first time somebody changed their address only one
 * of them would follow.
 *
 * A voucher has no line items, so the single item row IS the voucher: its
 * category and note, at quantity one. Passing an empty `items` array would
 * print "No items" on a document whose entire purpose is to say what the money
 * was for.
 */

function money(value: number): string {
  return `${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** `11-04-2026`, the order every other document here prints. */
function displayDate(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

export default function VoucherReceipt({ voucher }: { voucher: Voucher }) {
  const { shop } = useShopProfile();
  const income = voucher.type === "INCOME";
  const amount = money(voucher.amount);

  return (
    <Receipt
      business={{
        name: shop.name,
        tagline: shop.tagline,
        address: shop.address,
        bin: shop.bin,
      }}
      // What the document IS, in the words a Bangladeshi shop's books use.
      // "VOUCHER" alone would not say which way the money went, and that is
      // the one thing somebody holding the slip needs to know.
      title={income ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER"}
      meta={[
        { label: "Voucher No", value: voucher.voucherNo || "—" },
        { label: "Date", value: displayDate(voucher.date) },
        ...(voucher.branchName ? [{ label: "Branch", value: voucher.branchName }] : []),
        {
          label: income ? "Received in" : "Paid from",
          value: voucher.paymentAccountName || "Cash",
        },
      ]}
      itemsHeading="Particulars"
      items={[
        {
          name: voucher.description
            ? `${voucher.categoryName} — ${voucher.description}`
            : voucher.categoryName || "—",
          price: amount,
          qty: 1,
          total: amount,
        },
      ]}
      totals={[
        {
          label: income ? "Total Received" : "Total Paid",
          value: `৳ ${amount}`,
          strong: true,
          ruleAbove: true,
        },
      ]}
      footerNotes={[
        // Two signatures, because that is what makes a paper voucher evidence
        // of anything: one person released the money and one received it.
        "Received by: ____________________",
        "Authorised by: ____________________",
      ]}
      system={{ name: "SortPi" }}
    />
  );
}
