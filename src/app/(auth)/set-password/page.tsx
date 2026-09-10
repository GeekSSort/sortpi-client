"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell, { AuthAlert, AuthButton, AuthField } from "@/components/auth/AuthShell";
import { RegistrationService, Realm } from "@/services/registrationService";
import { tenantHref } from "@/lib/realmUrl";

/**
 * Choose a password, using the ticket the code check handed back.
 *
 * Where the person lands afterwards is the interesting part:
 *
 *   new company  → their brand new address, e.g. rahman.sortpi.com/login
 *   forgot pass  → back to the login page they came from (already the right one)
 *   platform     → the console login, NEVER a company address
 */

const RULES = [
  { test: (p: string) => p.length >= 8, label: "At least 8 characters" },
  { test: (p: string) => /[a-z]/i.test(p), label: "A letter" },
  { test: (p: string) => /[0-9]/.test(p), label: "A number" },
];

function SetPasswordInner() {
  const params = useSearchParams();
  const ticket = params.get("ticket") || "";
  const purpose = params.get("purpose") || "reset";
  const subdomain = params.get("subdomain") || "";
  const realm: Realm = params.get("realm") === "platform" ? "platform" : "tenant";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [addressReady, setAddressReady] = useState(false);
  const [waited, setWaited] = useState(0);

  const passed = useMemo(() => RULES.map((r) => r.test(password)), [password]);
  const strong = passed.every(Boolean);
  const matches = password.length > 0 && password === confirm;

  const destination = (given?: string) => {
    if (given) return given;
    if (realm === "platform") return "/login";
    if (purpose === "signup" && subdomain) {
      /**
       * Their own address exists only now that the account is finished.
       *
       * This used to build it from `host.split(".").slice(-2)` — the last two
       * labels of whatever host the page was on. That is right for
       * `sortpi.com` and wrong for every other shape: `sortpi.co.uk` became
       * `co.uk`, `app.sortpi.com` became `sortpi.com`, and on a company
       * address reached through the old relative sign-up link the base was
       * derived from that company's host rather than from the platform's.
       *
       * `tenantHref` reads `NEXT_PUBLIC_PLATFORM_BASE_DOMAIN`, which is the
       * value the API client already resolves the realm from and the mirror of
       * `PLATFORM_BASE_DOMAIN` on the server — so the address a new owner is
       * sent to is the one the backend will actually accept their token on.
       */
      return tenantHref(subdomain, "/login");
    }
    return "/login";
  };

  /**
   * Wait for the new company address to actually answer before offering it.
   *
   * A brand new subdomain has no certificate at the instant it is created. The
   * proxy issues one on demand, which takes a few seconds, and until it lands
   * the browser shows a full-page security warning rather than a login form —
   * `Strict-Transport-Security` carries `includeSubDomains`, so there is not
   * even a "proceed anyway" to click. The person's very first sight of their
   * own company is an interstitial telling them it is unsafe.
   *
   * So this polls the address instead of guessing at a delay. A fixed timer is
   * either too short on a slow issuance or wasted time on a fast one; a probe
   * releases the button the moment the handshake succeeds, which is usually
   * immediate because the certificate was requested when they STARTED signing
   * up, not now.
   *
   * `no-cors` because the answer is irrelevant — an opaque response still means
   * the TLS handshake completed, and a bad certificate rejects the promise
   * instead. `/health/` rather than the login page: it is the cheapest route
   * the proxy serves and it touches no session state.
   *
   * The wait is capped. If issuance is genuinely broken the button still
   * unlocks, because stranding somebody on a dead screen is worse than sending
   * them to a warning they can at least reload past.
   */
  useEffect(() => {
    if (!done) return;
    if (!(purpose === "signup" && subdomain)) {
      setAddressReady(true);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const probe = async () => {
      attempts += 1;
      setWaited(attempts * 2);
      try {
        await fetch(new URL("/health/", done).toString(), {
          mode: "no-cors",
          cache: "no-store",
        });
        if (!cancelled) setAddressReady(true);
      } catch {
        if (cancelled) return;
        // ~60s, then let them through regardless.
        if (attempts >= 30) setAddressReady(true);
        else timer = setTimeout(probe, 2000);
      }
    };

    probe();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [done, purpose, subdomain]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong || !matches) return;
    setBusy(true);
    setError(null);
    try {
      const res = await RegistrationService.setPassword(
        ticket,
        password,
        realm,
        purpose === "signup" ? "signup" : "reset"
      );
      setDone(destination(res?.redirectTo ?? undefined));
    } catch (err) {
      setError(RegistrationService.describeError(err));
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="You are all set"
        subtitle={
          purpose === "signup"
            ? "Your company account is ready. Sign in at your own address."
            : "Your password has been changed. Sign in with it now."
        }
      >
        <AuthButton
          type="button"
          disabled={!addressReady}
          onClick={() => (window.location.href = done)}
        >
          {addressReady ? "Go to sign in" : "Preparing your address…"}
        </AuthButton>
        {!addressReady && (
          <p className="w-full text-center text-[13px] text-[#737373]">
            Securing {subdomain ? `${subdomain}.` : "your address"} — this takes a few seconds.
            {waited >= 10 && ` (${waited}s)`}
          </p>
        )}
        <p className="w-full text-center text-[13px] break-all text-[#737373]">{done}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={purpose === "signup" ? "Choose your password" : "Set a new password"}
      subtitle="Pick something only you would know. You will use it every day."
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

      {!ticket && <AuthAlert>This link is incomplete. Start again from the sign-in page.</AuthAlert>}
      {error && <AuthAlert>{error}</AuthAlert>}

      <AuthButton type="submit" disabled={busy || !strong || !matches || !ticket}>
        {busy ? "Saving…" : "Save password"}
      </AuthButton>
    </AuthShell>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordInner />
    </Suspense>
  );
}
