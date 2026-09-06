"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { SupplierService } from "@/services";
import { GOLD_GRADIENT } from "@/components/shared/Modal";
import UploadIcon from "@/components/shared/UploadIcon";

/**
 * Add Supplier — Figma 73:3279.
 *
 * A 565 column down the middle: a card with the title, three 56px fields and
 * the 88px upload box, then the gold submit below it.
 *
 * The design's own heading lives in the navbar here, as on every page, and its
 * button group is hidden in the frame. Below sm the column goes full width.
 */

const LABEL = "w-full text-[18px] leading-[24px] font-medium text-[#525252]";
const FIELD =
  "flex h-[56px] w-full items-center rounded-[12px] bg-white px-[16px] py-[8px] shadow-[inset_0_0_0_1px_#eaeaea] transition-shadow focus-within:shadow-[inset_0_0_0_1px_#f5b800]";
const INPUT =
  "min-w-px flex-1 bg-transparent text-[16px] leading-[24px] font-normal text-[#525252] outline-none placeholder:text-[#525252]";

export default function AddSupplierPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mail, setMail] = useState("");
  const [image, setImage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return setError("Supplier name is required.");
    if (!phone.trim()) return setError("Phone number is required.");
    if (mail.trim() && !/^\S+@\S+\.\S+$/.test(mail.trim()))
      return setError("That email address doesn’t look right.");

    setSaving(true);
    setError(null);
    try {
      await SupplierService.createSupplier({
        name: name.trim(),
        phone: phone.trim(),
        mail: mail.trim() || "—",
        status: "Active",
      });
      setNote(`${name.trim()} added. Returning to the supplier list…`);
      window.setTimeout(() => router.push("/purchases/suppliers"), 900);
    } catch {
      setError("Could not save the supplier. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      <form onSubmit={save} className="mx-auto flex w-full max-w-[565px] flex-col gap-[24px]">
        {/* Card — 73:3853 */}
        <div className="w-full overflow-hidden rounded-[10px] bg-white pb-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
          {/* Head — 73:3854 */}
          <div className="flex w-full items-center justify-center bg-white px-[16px] pt-[16px] pb-[8px] shadow-[inset_0_0_0_1px_#eaeaea]">
            <p className="text-[16px] leading-[1.5] font-normal tracking-[-0.32px] whitespace-nowrap text-[#1e1e1e]">
              Add Supplier
            </p>
          </div>

          {/* Fields — 73:3857, 533 wide inside the 565 card */}
          <div className="mx-auto mt-[9px] flex w-full max-w-[533px] flex-col gap-[12px] px-[16px] sm:px-0">
            <div className="flex w-full flex-col gap-[8px]">
              <label htmlFor="sup-name" className={LABEL}>Supplier Name</label>
              <div className={FIELD}>
                <input
                  id="sup-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter supplier name"
                  className={INPUT}
                />
              </div>
            </div>

            <div className="flex w-full flex-col gap-[8px]">
              <label htmlFor="sup-phone" className={LABEL}>Phone Number</label>
              <div className={FIELD}>
                <input
                  id="sup-phone"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter supplier phone number"
                  className={INPUT}
                />
              </div>
            </div>

            <div className="flex w-full flex-col gap-[8px]">
              <label htmlFor="sup-mail" className={LABEL}>Email Address</label>
              <div className={FIELD}>
                <input
                  id="sup-mail"
                  // Not type="email": the browser's own bubble would pre-empt
                  // the inline message the rest of the app uses.
                  inputMode="email"
                  value={mail}
                  onChange={(e) => {
                    setMail(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter email address"
                  className={INPUT}
                />
              </div>
            </div>

            {/* Upload — 73:3908, 88 tall here (Add Product's is 56) */}
            <label className="flex h-[88px] w-full cursor-pointer items-center justify-center gap-[10px] rounded-[12px] bg-white px-[16px] py-[8px] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa]">
              {image ? (
                <>
                  <span className="relative size-[48px] shrink-0 overflow-hidden rounded-[8px]">
                    <Image src={image} alt="" fill sizes="48px" className="object-cover" unoptimized />
                  </span>
                  <span className="text-[16px] leading-[24px] text-[#525252]">Image selected</span>
                </>
              ) : (
                <>
                  <span className="text-[#525252]">
                    <UploadIcon />
                  </span>
                  <span className="w-[106px] text-center text-[16px] leading-[24px] text-[#525252]">
                    Upload Image
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label="Upload image"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setImage(URL.createObjectURL(file));
                }}
                className="hidden"
              />
            </label>

            {error && <p className="text-[13px] text-[#ef4444]">{error}</p>}
            {note && <p className="text-[13px] text-[#525252]">{note}</p>}
          </div>
        </div>

        {/* Submit — 73:3905, outside the card */}
        <button
          type="submit"
          disabled={saving}
          style={{ backgroundImage: GOLD_GRADIENT }}
          className="flex h-[48px] w-full cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add Supplier"}
        </button>
      </form>
    </div>
  );
}
