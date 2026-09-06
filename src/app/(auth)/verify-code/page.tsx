"use client";

import React, { Suspense, useState } from "react";
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
    setError(null);
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
          <button type="button" onClick={resend} className="font-medium text-[#f5b800]">
            Send another
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
