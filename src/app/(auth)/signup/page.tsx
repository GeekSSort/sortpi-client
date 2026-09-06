"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { AuthAlert, AuthButton, AuthField } from "@/components/auth/AuthShell";
import { RegistrationService } from "@/services/registrationService";

/**
 * A new company signs itself up.
 *
 * This page runs on the MAIN site, not on a company address — the company does
 * not have one yet, which is the whole point of the form. The address they
 * choose here becomes theirs once the password is set.
 */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressCheck, setAddressCheck] = useState<{
    state: "idle" | "checking" | "free" | "taken";
    reason?: string | null;
  }>({ state: "idle" });

  /**
   * Ask whether the address is free, a beat after they stop typing.
   *
   * Debounced because this fires per keystroke otherwise, and skipped below
   * three characters because the server would only tell us what the field's
   * own minLength already says. The answer is advice: the same rules run
   * again at sign-up, so a stale "free" cannot get anybody a taken address.
   */
  useEffect(() => {
    const value = subdomain.trim();
    let cancelled = false;
    // Every state change happens inside the timer, never in the effect body:
    // setting state synchronously here would re-render on each keystroke
    // before the debounce has done anything useful.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (value.length < 3) {
        setAddressCheck({ state: "idle" });
        return;
      }
      setAddressCheck({ state: "checking" });
      RegistrationService.checkSubdomain(value)
        .then((res) => {
          if (cancelled) return;
          setAddressCheck(
            res.available ? { state: "free" } : { state: "taken", reason: res.reason }
          );
        })
        // A failed check must not block the form: sign-up validates anyway.
        .catch(() => !cancelled && setAddressCheck({ state: "idle" }));
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [subdomain]);

  const onCompanyName = (value: string) => {
    setCompanyName(value);
    // Suggest the address from the name until they change it themselves.
    if (!subdomainEdited) setSubdomain(slugify(value));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await RegistrationService.startSignup({
        companyName: companyName.trim(),
        subdomain: subdomain.trim(),
        ownerName: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      router.push(
        `/verify-code?email=${encodeURIComponent(email.trim())}&purpose=signup&subdomain=${encodeURIComponent(subdomain.trim())}`
      );
    } catch (err) {
      setError(RegistrationService.describeError(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your company account"
      subtitle="Takes a minute. We will email you a code to confirm it is you."
      onSubmit={submit}
      footer={
        <>
          Already have an account?
          <Link href="/login" className="font-medium text-[#f5b800]">
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex w-full flex-col items-start gap-[16px]">
        <AuthField
          label="Company name"
          value={companyName}
          onChange={(e) => onCompanyName(e.target.value)}
          placeholder="Rahman Stores"
          required
        />

        <AuthField
          label="Your web address"
          value={subdomain}
          onChange={(e) => {
            setSubdomainEdited(true);
            setSubdomain(slugify(e.target.value));
          }}
          placeholder="rahman"
          required
          minLength={3}
          maxLength={63}
          hint={
            <>
              Your staff will sign in at{" "}
              <span className="font-medium text-[#1e1e1e]">
                {subdomain || "yourname"}.sortpoint.com
              </span>
              . This cannot be changed later.
              {addressCheck.state === "checking" && (
                <span className="ml-1 text-[#8a8a8a]">Checking…</span>
              )}
              {addressCheck.state === "free" && (
                <span className="ml-1 font-medium text-[#1a8f4c]">Available.</span>
              )}
              {addressCheck.state === "taken" && (
                <span className="ml-1 font-medium text-[#c0392b]">
                  {addressCheck.reason || "Taken."}
                </span>
              )}
            </>
          }
        />

        <AuthField
          label="Your name"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Nusrat Rahman"
          required
        />

        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          hint="We send your confirmation code here, so use an address you can open now."
        />

        <AuthField
          label="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+8801700000000"
        />
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <AuthButton type="submit" disabled={busy}>
        {busy ? "Sending code…" : "Send me a code"}
      </AuthButton>
    </AuthShell>
  );
}
