"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell, { AuthAlert, AuthButton, AuthField } from "@/components/auth/AuthShell";
import { RegistrationService } from "@/services/registrationService";

/**
 * Set the password an owner invitation was issued for.
 *
 * This page did not exist, and every invitation ever sent pointed at it.
 *
 * `apps/accounts/invitations.py` mails
 * `{tenant address}/accept-invitation?uid=…&token=…`, `proxy.ts` already lists
 * `/accept-invitation` as a public path, and `POST /auth/accept-invitation`
 * has been implemented and documented on the server since the invitation
 * feature was written — but the route was never built here. So the ONE way a
 * company created by platform staff gets its first sign-in — `make provision`,
 * and the console's own tenant creation, which both invite the owner rather
 * than setting a password for them — ended on a 404, and the owner had no
 * route into their own account at all.
 *
 * It is the sibling of `/set-password`, and deliberately not a branch of it:
 * that page spends an OTP ticket from a three-step code flow, this one spends
 * a signed link that is the credential in its own right. Sharing the screen
 * would mean one component holding two different proofs of identity.
 */

const RULES = [
  { test: (p: string) => p.length >= 8, label: "At least 8 characters" },
  { test: (p: string) => /[a-z]/i.test(p), label: "A letter" },
  { test: (p: string) => /[0-9]/.test(p), label: "A number" },
];

function AcceptInvitationInner() {
  const router = useRouter();
  const params = useSearchParams();
  const uid = params.get("uid") || "";
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passed = useMemo(() => RULES.map((r) => r.test(password)), [password]);
  const strong = passed.every(Boolean);
  const matches = password.length > 0 && password === confirm;
  const linkComplete = Boolean(uid && token);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong || !matches || !linkComplete) return;
    setBusy(true);
    setError(null);
    try {
      await RegistrationService.acceptInvitation(uid, token, password);
      setDone(true);
    } catch (err) {
      setError(RegistrationService.describeError(err));
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="Your account is ready"
        subtitle="Sign in with the password you just chose."
      >
        {/*
          Relative, and correctly so: the invitation link already carried the
          company's own address, so this page is already on the right host and
          `/login` is that company's sign-in.

          A client navigation is enough — unlike the sign-in page's own
          redirect, there is no session to re-read here, because the whole
          point is that this person has not signed in yet.
        */}
        <AuthButton type="button" onClick={() => router.push("/login")}>
          Go to sign in
        </AuthButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose your password"
      subtitle="You have been invited to SortPi. Pick something only you would know."
      onSubmit={submit}
    >
      <div className="flex w-full flex-col items-start gap-[16px]">
        <AuthField
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="new-password"
        />
        <AuthField
          label="Type it again"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="new-password"
        />
      </div>

      <ul className="flex w-full flex-col gap-[6px]">
        {RULES.map((rule, i) => (
          <li
            key={rule.label}
            className={`flex items-center gap-[8px] text-[13px] ${
              passed[i] ? "text-[#1c6b45]" : "text-[#737373]"
            }`}
          >
            <span aria-hidden>{passed[i] ? "✓" : "○"}</span>
            {rule.label}
          </li>
        ))}
        {confirm.length > 0 && !matches && (
          <li className="flex items-center gap-[8px] text-[13px] text-[#a02620]">
            <span aria-hidden>✕</span>
            Both passwords must match
          </li>
        )}
      </ul>

      {!linkComplete && (
        <AuthAlert>
          This invitation link is incomplete. Open the one in your email again,
          or ask whoever invited you to send another.
        </AuthAlert>
      )}
      {error && <AuthAlert>{error}</AuthAlert>}

      <AuthButton type="submit" disabled={busy || !strong || !matches || !linkComplete}>
        {busy ? "Saving…" : "Save password"}
      </AuthButton>

      <p className="text-center text-[13px] leading-[1.5] text-[#737373]">
        The link works once. After this, sign in with your email and the
        password you just chose.
      </p>
    </AuthShell>
  );
}

export default function AcceptInvitationPage() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <AcceptInvitationInner />
    </Suspense>
  );
}
