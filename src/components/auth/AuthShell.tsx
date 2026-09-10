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
  width = 480,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  /**
   * How wide the card may grow, in px.
   *
   * 480 is right for a card of one column — sign in, a code, a password. A
   * form with five fields at that width is a column taller than the viewport,
   * so the person scrolls to find the button and cannot see what they typed at
   * the same time. Sign-up passes a wider card and lays its fields two to a
   * row; the shell stays responsive either way, because this is a MAXIMUM and
   * the card is still `w-full` beneath it.
   */
  width?: number;
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
        style={{ maxWidth: width }}
        className="relative flex w-full flex-col items-center gap-[24px] rounded-[10px] bg-white p-[24px] shadow-[0_1px_2px_0_rgba(16,24,40,0.04),0_8px_20px_-6px_rgba(16,24,40,0.08),0_28px_56px_-16px_rgba(16,24,40,0.12),inset_0_0_0_1px_rgba(16,24,40,0.05)]"
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

/** Eye with a slash — the password is hidden, tap to show. */
function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.33 3.33 16.67 16.67M11.67 11.86A2.5 2.5 0 0 1 8.14 8.33M16.34 13.01c.48-.42.9-.83 1.27-1.22a2.5 2.5 0 0 0 0-3.58C15.98 6.5 13.18 4.17 10 4.17c-.74 0-1.46.13-2.16.34M5.42 5.67C4.2 6.45 3.16 7.4 2.39 8.21a2.5 2.5 0 0 0 0 3.58c1.63 1.72 4.43 4.04 7.61 4.04 1.56 0 3.02-.56 4.3-1.33"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The same eye, open — the password is showing. */
function EyeOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M17.61 8.21a2.5 2.5 0 0 1 0 3.58C15.98 13.5 13.18 15.83 10 15.83S4.02 13.5 2.39 11.79a2.5 2.5 0 0 1 0-3.58C4.02 6.5 6.82 4.17 10 4.17s5.98 2.33 7.61 4.04Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A labelled input. A password one carries its own show/hide eye.
 *
 * The eye was on the sign-in page and on none of the others, so somebody
 * CHOOSING a password — set-password, an invitation, a console account — had to
 * type it twice blind and got "both passwords must match" with no way to see
 * which one was wrong. Choosing is the case that needs it most.
 *
 * Built in here rather than added to four call sites, so the next password
 * field gets it without anybody remembering.
 */
export function AuthField({
  label,
  hint,
  type,
  ...rest
}: { label: string; hint?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [revealed, setRevealed] = React.useState(false);
  const isPassword = type === "password";

  return (
    <label className="flex w-full flex-col items-start gap-[8px]">
      <span className="w-full text-[18px] leading-[24px] font-medium text-[#525252]">{label}</span>
      <div className="flex h-[56px] w-full items-center gap-[12px] rounded-[12px] border border-solid border-[#f5b800] bg-white px-[16px] py-[8px]">
        <input
          {...rest}
          type={isPassword && revealed ? "text" : type}
          className="min-w-px flex-1 bg-transparent text-[16px] leading-[24px] font-normal text-[#525252] outline-none placeholder:text-[#a3a3a3]"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="flex size-[20px] shrink-0 cursor-pointer items-center justify-center text-[#525252]"
          >
            {revealed ? <EyeOnIcon /> : <EyeOffIcon />}
          </button>
        )}
      </div>
      {hint && <span className="text-[13px] leading-[1.4] text-[#737373]">{hint}</span>}
    </label>
  );
}

/**
 * A phone box whose country is chosen rather than typed.
 *
 * One control, not two: the select sits INSIDE the same bordered box as the
 * input, so it reads as a single field and the dialling code looks like a
 * prefix on the number instead of a separate question. The select is sized to
 * its content and the input takes the rest, which keeps `+880` and `+1` from
 * shifting the field width as the country changes.
 *
 * `inputMode="numeric"` rather than `type="number"`: a number input gives
 * phones the right keypad but also spinner arrows, silent scroll-wheel edits,
 * and a value that drops leading zeros — all wrong for a phone number.
 */
export function PhoneField({
  label,
  hint,
  problem,
  countries,
  countryIso,
  onCountryChange,
  ...rest
}: {
  label: string;
  hint?: React.ReactNode;
  problem?: string | null;
  countries: { iso: string; name: string; dial: string }[];
  countryIso: string;
  onCountryChange: (iso: string) => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const dial = countries.find((c) => c.iso === countryIso)?.dial ?? "";

  return (
    <label className="flex w-full flex-col items-start gap-[8px]">
      <span className="w-full text-[18px] leading-[24px] font-medium text-[#525252]">{label}</span>
      <div
        className={`flex h-[56px] w-full items-center gap-[8px] rounded-[12px] border border-solid bg-white px-[16px] py-[8px] ${
          problem ? "border-[#c0392b]" : "border-[#f5b800]"
        }`}
      >
        <div className="flex shrink-0 items-center gap-[4px]">
          <select
            value={countryIso}
            onChange={(e) => onCountryChange(e.target.value)}
            aria-label="Country calling code"
            className="max-w-[92px] cursor-pointer appearance-none bg-transparent text-[16px] leading-[24px] font-medium text-[#525252] outline-none"
          >
            {countries.map((c) => (
              // The option text carries the country NAME because a bare list
              // of dialling codes is unreadable when it is open; the closed
              // control shows only "+880" beside it, which is all that needs
              // to be visible once chosen.
              <option key={c.iso} value={c.iso}>
                {c.iso} +{c.dial}
              </option>
            ))}
          </select>
          <span aria-hidden className="text-[#a3a3a3]">
            |
          </span>
        </div>
        <input
          {...rest}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className="min-w-px flex-1 bg-transparent text-[16px] leading-[24px] font-normal text-[#525252] outline-none placeholder:text-[#a3a3a3]"
        />
        <span aria-hidden className="shrink-0 text-[13px] text-[#a3a3a3]">
          +{dial}
        </span>
      </div>
      {problem ? (
        <span className="text-[13px] leading-[1.4] font-medium text-[#c0392b]">{problem}</span>
      ) : (
        hint && <span className="text-[13px] leading-[1.4] text-[#737373]">{hint}</span>
      )}
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
    /* Six 52px boxes and five 10px gaps is 362px of content. Inside this card
       on a 360px phone there are about 280px, so the last box or two sat
       outside the card — on the screen whose only job is entering the code.
       The boxes share the width instead and stop growing at 52px, so the
       desktop layout is exactly as it was. */
    <div className="flex w-full items-center justify-center gap-[6px] sm:gap-[10px]">
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
          className="h-[56px] w-full min-w-0 max-w-[52px] flex-1 rounded-[12px] border border-solid border-[#f5b800] bg-white text-center text-[20px] font-semibold text-[#1e1e1e] outline-none focus:border-[#1e1e1e] disabled:opacity-60 sm:h-[64px] sm:text-[24px]"
        />
      ))}
    </div>
  );
}
