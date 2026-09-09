"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { AuthAlert, AuthButton, AuthField } from "@/components/auth/AuthShell";
import { RegistrationService } from "@/services/registrationService";
import { platformHref, useOnTenantHost } from "@/lib/realmUrl";

/**
 * Forgotten password for our own staff, on the platform console.
 *
 * Kept separate from the company page on purpose. Platform staff belong to no
 * company, so if this shared the company route, a customer's address could be
 * used to start a reset on one of our admin accounts — and the email would
 * look genuine.
 *
 * It has its own page and its own server route. The banner below has always
 * said "it works only on the console address" — and until the server was given
 * the matching check that was true of the wording alone: `is_platform_staff`
 * scoped which ACCOUNT could be found, and nothing scoped where the request
 * came FROM, so a customer's own subdomain could put a genuine console reset
 * code into a staff mailbox. The server refuses that now, and this page sends
 * the reader to the console rather than submitting into a silent 204.
 */
export default function PlatformForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrongHost = useOnTenantHost();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await RegistrationService.requestCode(email.trim(), "platform");
      router.push(
        `/verify-code?email=${encodeURIComponent(email.trim())}&purpose=reset&realm=platform`
      );
    } catch (err) {
      setError(RegistrationService.describeError(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Console password reset"
      subtitle="For SortPi staff only. Customers should use their own company address."
      onSubmit={submit}
      footer={
        <>
          Not staff?
          <Link href="/login" className="font-medium text-[#f5b800]">
            Company sign in
          </Link>
        </>
      }
    >
      {wrongHost ? (
        <AuthAlert>
          This resets a SortPi staff account and works only on the console
          address.{" "}
          <a href={platformHref("/platform/forgot-password")} className="font-medium underline">
            Open it there
          </a>
          .
        </AuthAlert>
      ) : (
        <AuthAlert tone="info">
          This resets a SortPi staff account, not a customer account. It works
          only on the console address.
        </AuthAlert>
      )}

      <AuthField
        label="Staff email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@sortpi.com"
        required
        autoComplete="email"
      />

      {error && <AuthAlert>{error}</AuthAlert>}

      <AuthButton type="submit" disabled={busy || wrongHost}>
        {busy ? "Sending…" : "Send code"}
      </AuthButton>
    </AuthShell>
  );
}
