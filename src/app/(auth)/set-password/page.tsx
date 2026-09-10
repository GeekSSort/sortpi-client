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
  const [probePassed, setProbePassed] = useState(false);
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
  // Only a brand new company address needs the wait. A password reset goes
  // back to a host that has been serving for months.
  const needsAddressWait = purpose === "signup" && Boolean(subdomain);
  // Derived, not stored. Setting "ready" from inside the effect for the case
  // that never needed to wait is a second render for a value already known at
  // render time — and React's lint rule is right to refuse it.
  const addressReady = !needsAddressWait || probePassed;

  useEffect(() => {
    if (!done || !needsAddressWait) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const startedAt = Date.now();

    // A floor under the wait, on top of the probe.
    //
    // The probe answers "did the handshake work", which is the question that
    // matters, but a certificate installed a fraction of a second ago has
    // succeeded once and can still lose a race with the redirect. Five seconds
    // costs nothing against the minute the person just spent signing up, and it
    // makes the guard visible — without it a fast issuance releases the button
    // instantly and there is no way to tell the check ran at all.
    const MIN_WAIT_MS = 5000;

    const release = () => {
      if (cancelled) return;
      const left = MIN_WAIT_MS - (Date.now() - startedAt);
      if (left > 0) timer = setTimeout(() => !cancelled && setProbePassed(true), left);
      else setProbePassed(true);
    };

    // Drives the counter on screen, so the wait reads as progress rather than
    // as the page having hung.
    const tick = setInterval(
      () => !cancelled && setWaited(Math.round((Date.now() - startedAt) / 1000)),
      500
    );

    const probe = async () => {
      attempts += 1;
      try {
        await fetch(new URL("/health/", done).toString(), {
          mode: "no-cors",
          cache: "no-store",
        });
        release();
      } catch {
        if (cancelled) return;
        // ~60s, then let them through regardless.
        if (attempts >= 30) release();
        else timer = setTimeout(probe, 2000);
      }
    };

    probe();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [done, needsAddressWait]);

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
          <p className="flex w-full items-center justify-center gap-[8px] text-center text-[13px] text-[#737373]">
            <span
              aria-hidden
              className="inline-block h-[13px] w-[13px] animate-spin rounded-full border-[2px] border-[#d4d4d4] border-t-[#525252]"
            />
            Securing your address — a few seconds{waited > 0 ? ` (${waited}s)` : ""}
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
