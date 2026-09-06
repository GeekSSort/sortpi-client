"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { AuthAlert, AuthButton, AuthField } from "@/components/auth/AuthShell";
import { RegistrationService } from "@/services/registrationService";

/**
 * Forgotten password for someone inside a company.
 *
 * It runs on that company's own address, because that is where the account
 * lives. On another company's address it must not find them: the server looks
 * the email up only inside the company the address names. That stops the page
 * being used to find out who is a customer of whom.
 *
 * Our own staff use /platform/forgot-password.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await RegistrationService.requestCode(email.trim(), "tenant");
      router.push(`/verify-code?email=${encodeURIComponent(email.trim())}&purpose=reset`);
    } catch (err) {
      setError(RegistrationService.describeError(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a 6-digit code."
      onSubmit={submit}
      footer={
        <>
          Remembered it?
          <Link href="/login" className="font-medium text-[#f5b800]">
            Back to sign in
          </Link>
        </>
      }
    >
      <AuthField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        required
        autoComplete="email"
      />

      {error && <AuthAlert>{error}</AuthAlert>}

      <AuthButton type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send code"}
      </AuthButton>

      <p className="text-center text-[13px] leading-[1.5] text-[#737373]">
        If that email has an account here, a code is on its way. We do not say
        either way, so nobody can use this page to find out who has an account.
      </p>
    </AuthShell>
  );
}
