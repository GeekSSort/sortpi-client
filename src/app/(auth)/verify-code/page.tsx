"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell, { AuthAlert, AuthButton, OtpInput } from "@/components/auth/AuthShell";
import { RegistrationService, Realm } from "@/services/registrationService";

/**
 * Enter the code we emailed.
 *
 * One page for all three journeys — new company, forgotten password, and
 * platform staff — because the step is identical. What differs is where the
 * person goes next, which `purpose` and `realm` carry through.
 */

/**
 * The server's own cooldown, mirrored.
 *
 * `OTP_RESEND_COOLDOWN_SECONDS` defaults to 60 and `otp.resend` refuses
 * anything inside it with RESEND_TOO_SOON. A number here that disagreed would
 * either offer a button that fails or hide one that would have worked, so if
 * the setting is changed this changes with it.
 */
const RESEND_COOLDOWN_SECONDS = 60;

function VerifyCodeInner() {
  const router = useRouter();
  const params = useSearchParams();

  const email = params.get("email") || "";
  const purpose = params.get("purpose") || "reset";
  // Anything that is not a sign-up is a reset, so a hand-typed query string
  // cannot ask the server for a journey that does not exist.
  const otpPurpose = purpose === "signup" ? "signup" : "reset";
  const subdomain = params.get("subdomain") || "";
  const realm: Realm = params.get("realm") === "platform" ? "platform" : "tenant";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  /**
   * Seconds until another code may be asked for.
   *
   * The server refuses one inside `OTP_RESEND_COOLDOWN_SECONDS` (60) with
   * RESEND_TOO_SOON, and this screen offered "Send another" the whole time —
   * so the ordinary thing to do when a code has not arrived was to press a
   * button and be told off. Counting down says WHEN instead, and the number
   * here is the server's own cooldown rather than a guess.
   *
   * It starts at 60 on arrival because a code was just sent to get here.
   */
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The purpose travels with the code: sign-up and reset are separate
      // requests on the server, and a code minted for one is refused by the
      // other.
      const { ticket } = await RegistrationService.verifyCode(email, code, realm, otpPurpose);
      const q = new URLSearchParams({ ticket, purpose, realm });
      if (subdomain) q.set("subdomain", subdomain);
      router.push(`/set-password?${q.toString()}`);
    } catch (err) {
      setError(RegistrationService.describeError(err));
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError(null);
    // Started before the request, not after it: the cooldown is what stops a
    // second press while the first is still in flight, and a timer that only
    // starts on success leaves the button live for the whole round-trip.
    setCooldown(RESEND_COOLDOWN_SECONDS);
    try {
      await RegistrationService.resendCode(email, otpPurpose, realm);
      setResent(true);
    } catch (err) {
      setError(RegistrationService.describeError(err));
    }
  };

  return (
    <AuthShell
      title="Enter your code"
      subtitle={email ? `We emailed a 6-digit code to ${email}.` : "We emailed you a 6-digit code."}
      onSubmit={submit}
      footer={
        <>
          Did not get it?
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0}
            className={
              cooldown > 0
                ? "font-medium text-[#a3a3a3]"
                : "cursor-pointer font-medium text-[#f5b800]"
            }
          >
            {cooldown > 0 ? `Send another in ${cooldown}s` : "Send another"}
          </button>
        </>
      }
    >
      <OtpInput value={code} onChange={setCode} disabled={busy} />

      {resent && !error && <AuthAlert tone="info">A new code is on its way.</AuthAlert>}
      {error && <AuthAlert>{error}</AuthAlert>}

      <AuthButton type="submit" disabled={busy || code.length < 6}>
        {busy ? "Checking…" : "Confirm"}
      </AuthButton>

      <p className="text-center text-[13px] leading-[1.5] text-[#737373]">
        Codes last 10 minutes. Do not share it with anyone — we will never ask you for it.
      </p>
    </AuthShell>
  );
}

export default function VerifyCodePage() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <VerifyCodeInner />
    </Suspense>
  );
}
