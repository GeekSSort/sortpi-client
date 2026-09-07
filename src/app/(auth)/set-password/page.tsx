"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell, { AuthAlert, AuthButton, AuthField } from "@/components/auth/AuthShell";
import { RegistrationService, Realm } from "@/services/registrationService";

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

  const passed = useMemo(() => RULES.map((r) => r.test(password)), [password]);
  const strong = passed.every(Boolean);
  const matches = password.length > 0 && password === confirm;

  const destination = (given?: string) => {
    if (given) return given;
    if (realm === "platform") return "/login";
    if (purpose === "signup" && subdomain) {
      // Their own address exists only now that the account is finished.
      const { protocol, host } = window.location;
      const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
      const base = host.split(":")[0].split(".").slice(-2).join(".");
      return `${protocol}//${subdomain}.${base}${port}/login`;
    }
    return "/login";
  };

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
        <AuthButton type="button" onClick={() => (window.location.href = done)}>
          Go to sign in
        </AuthButton>
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
