"use client";

import React from "react";
import Image from "next/image";

/**
 * The card every sign-in style page sits in.
 *
 * Lifted from the login page so sign-up, code entry and password reset all
 * look like the same product rather than three different ones.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
}) {
  const Inner = onSubmit ? "form" : "div";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#FDFDFD] p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(#F5B800 2px, transparent 2px)",
          backgroundSize: "40px 40px",
          backgroundPosition: "center",
          opacity: 0.7,
          maskImage:
            "radial-gradient(ellipse 85% 85% at 50% 50%, #000 0%, #000 45%, transparent 95%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 85% at 50% 50%, #000 0%, #000 45%, transparent 95%)",
        }}
      />

      <Inner
        {...(onSubmit ? { onSubmit } : {})}
        className="relative flex w-full max-w-[549px] flex-col items-center gap-[24px] rounded-[10px] bg-white p-[24px] shadow-[0px_0px_28px_0px_rgba(207,207,207,0.16),inset_0px_0px_1px_0px_rgba(0,0,0,0.25)]"
      >
        <Image
          src="/auth/logo.png"
          alt="SortPi"
          width={106}
          height={100}
          priority
          className="h-[100px] w-[106px] shrink-0 rounded-[24px] object-cover"
        />

        <div className="flex w-full flex-col items-center gap-[8px] text-center">
          <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.72px] text-[#1e1e1e]">
            {title}
          </h1>
          <p className="text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252]">
            {subtitle}
          </p>
        </div>

        {children}

        {footer && (
          <div className="flex w-full items-center justify-center gap-[6px] text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252]">
            {footer}
          </div>
        )}
      </Inner>
    </div>
  );
}

export function AuthField({
  label,
  hint,
  ...rest
}: { label: string; hint?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex w-full flex-col items-start gap-[8px]">
      <span className="w-full text-[18px] leading-[24px] font-medium text-[#525252]">{label}</span>
      <div className="flex h-[56px] w-full items-center rounded-[12px] border border-solid border-[#f5b800] bg-white px-[16px] py-[8px]">
        <input
          {...rest}
          className="min-w-px flex-1 bg-transparent text-[16px] leading-[24px] font-normal text-[#525252] outline-none placeholder:text-[#a3a3a3]"
        />
      </div>
      {hint && <span className="text-[13px] leading-[1.4] text-[#737373]">{hint}</span>}
    </label>
  );
}

export function AuthButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="flex h-[56px] w-full cursor-pointer items-center justify-center rounded-[12px] bg-[#f5b800] text-[18px] leading-[24px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function AuthAlert({ tone = "error", children }: { tone?: "error" | "info"; children: React.ReactNode }) {
  const styles =
    tone === "error"
      ? "bg-[#fdeceb] text-[#a02620]"
      : "bg-[#eef4fd] text-[#1b4a8a]";
  return (
    <p role="alert" className={`w-full rounded-[10px] px-[16px] py-[12px] text-[14px] leading-[1.5] font-medium ${styles}`}>
      {children}
    </p>
  );
}

/**
 * Six boxes for the emailed code.
 *
 * Typing moves forward, backspace moves back, and pasting the whole code from
 * the email fills every box — which is what people actually do.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  disabled?: boolean;
}) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  const setAt = (i: number, char: string) => {
    const next = (value.padEnd(length, " ").slice(0, length).split("") as string[]);
    next[i] = char;
    onChange(next.join("").replace(/\s/g, ""));
  };

  return (
    <div className="flex w-full items-center justify-center gap-[10px]">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={value[i] || ""}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const char = e.target.value.replace(/\D/g, "").slice(-1);
            if (!char) return;
            setAt(i, char);
            refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i]) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
            if (digits) {
              onChange(digits);
              refs.current[Math.min(digits.length, length - 1)]?.focus();
            }
          }}
          className="h-[64px] w-[52px] rounded-[12px] border border-solid border-[#f5b800] bg-white text-center text-[24px] font-semibold text-[#1e1e1e] outline-none focus:border-[#1e1e1e] disabled:opacity-60"
        />
      ))}
    </div>
  );
}
