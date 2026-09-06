"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HrmService, Lookup } from "@/services/hrmService";
import { GOLD_GRADIENT } from "@/components/shared/Modal";

/**
 * Add Employees — Figma 74:4463.
 *
 * A 565px card centred on the page: a title strip, then 56px fields at 12px
 * apart, an 88px upload box, and a full-width gold submit below the card.
 */

const LABEL = "w-full text-[18px] leading-[24px] font-medium text-[#525252]";
const INPUT =
  "flex h-[56px] w-full items-center rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[8px] text-[16px] leading-[24px] text-[#525252] outline-none placeholder:text-[#525252] focus:border-[#f5b800]";

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A 56px box that opens a list, and still accepts a name that is not on it. */
function PickerField({
  label,
  value,
  onChange,
  placeholder,
  options,
  caret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Lookup[];
  caret?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const matches = options.filter((o) =>
    o.name.toLowerCase().includes(value.trim().toLowerCase())
  );

  return (
    <div className="flex w-full flex-col gap-[8px]">
      <label className={LABEL} htmlFor={label}>
        {label}
      </label>
      <div ref={ref} className="relative w-full">
        <div className={`${INPUT} gap-[12px] focus-within:border-[#f5b800]`}>
          <input
            id={label}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#525252]"
          />
          {caret && (
            <button
              type="button"
              aria-label={`Choose ${label.toLowerCase()}`}
              onClick={() => setOpen((v) => !v)}
              className="shrink-0 cursor-pointer text-[#525252]"
            >
              <CaretIcon open={open} />
            </button>
          )}
        </div>

        {open && matches.length > 0 && (
          <ul
            role="listbox"
            className="absolute top-[60px] right-0 left-0 z-30 max-h-[220px] overflow-y-auto rounded-[12px] border border-[#eaeaea] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
          >
            {matches.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.name === value}
                  onClick={() => {
                    onChange(o.name);
                    setOpen(false);
                  }}
                  className="w-full cursor-pointer px-[16px] py-[10px] text-left text-[15px] text-[#525252] transition-colors hover:bg-[#fdf7e6]"
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AddEmployeePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [lookups, setLookups] = useState<{ departments: Lookup[]; designations: Lookup[] }>({
    departments: [],
    designations: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    HrmService.getLookups()
      .then((l) => !cancelled && setLookups(l))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await HrmService.createEmployee({ name, email, phone, department, designation });
      router.push("/hrm");
    } catch (err) {
      setError(HrmService.describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col items-center select-none">
      <div className="flex w-full max-w-[565px] flex-col gap-[24px]">
        {/* Card — 74:5325 */}
        <div className="flex w-full flex-col items-center gap-[9px] overflow-hidden rounded-[10px] border border-solid border-[#eaeaea] bg-white pb-[16px]">
          <div className="flex w-full items-center justify-center border-b border-solid border-[#eaeaea] px-[16px] pt-[16px] pb-[8px]">
            <p className="text-[16px] leading-[1.5] tracking-[-0.32px] whitespace-nowrap text-[#1e1e1e]">
              Add Employee
            </p>
          </div>

          <div className="flex w-full flex-col gap-[12px] px-[16px]">
            {error && (
              <p role="alert" className="rounded-[8px] bg-[#ffdfe2] px-[12px] py-[8px] text-[13px] text-[#e63946]">
                {error}
              </p>
            )}

            <div className="flex w-full flex-col gap-[8px]">
              <label className={LABEL} htmlFor="employee-name">
                Employee Name
              </label>
              <input
                id="employee-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter employee name"
                className={INPUT}
              />
            </div>

            <div className="flex w-full flex-col gap-[8px]">
              <label className={LABEL} htmlFor="employee-phone">
                Phone Number
              </label>
              <input
                id="employee-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter supplier phone number"
                className={INPUT}
              />
            </div>

            <div className="flex w-full flex-col gap-[8px]">
              <label className={LABEL} htmlFor="employee-email">
                Email Address
              </label>
              <input
                id="employee-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                className={INPUT}
              />
            </div>

            <PickerField
              label="Department"
              value={department}
              onChange={setDepartment}
              placeholder="Select employee department"
              options={lookups.departments}
              caret
            />

            <PickerField
              label="Designation"
              value={designation}
              onChange={setDesignation}
              placeholder="Select employee designation"
              options={lookups.designations}
            />

            {/* Upload box — 74:5342 */}
            <label className="flex h-[88px] w-full cursor-pointer items-center justify-center rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[8px]">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setPhoto(file ? URL.createObjectURL(file) : null);
                }}
              />
              <span className="flex items-center gap-[10px]">
                {photo ? (
                  <Image src={photo} alt="" width={33} height={24} className="h-[24px] w-[32.984px] object-cover" unoptimized />
                ) : (
                  <Image src="/icons/upload-cloud.svg" alt="" width={33} height={24} className="h-[24px] w-[32.984px]" />
                )}
                <span className="w-[106px] text-center text-[16px] leading-[24px] text-[#525252]">
                  Upload Image
                </span>
              </span>
            </label>

            {photo && (
              <p className="text-[13px] text-[#525252]">
                Preview only — the employee API has no photo field yet, so this image is not saved.
              </p>
            )}
          </div>
        </div>

        {/* Submit — 74:5347 */}
        <button
          type="submit"
          disabled={saving}
          style={{ backgroundImage: GOLD_GRADIENT }}
          className="flex w-full cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[12px] text-[16px] leading-[24px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Adding..." : "Add Employee"}
        </button>
      </div>
    </form>
  );
}
