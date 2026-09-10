"use client";

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";

import AuthShell, { AuthAlert, AuthField } from "@/components/auth/AuthShell";
import { AuthService } from "@/services";
import { resolveRealm, currentSubdomain } from "@/services/apiClient";
import { platformHref } from "@/lib/realmUrl";

/**
 * Login — Figma 19:7398.
 *
 * The card, the dot lattice behind it, the logo and the heading were a
 * hand-written copy of AuthShell rather than AuthShell itself. It matched at
 * the width it was written at and drifted everywhere else: the shell learned
 * `min-h-dvh`, fluid padding and `clamp()` type, and this page kept
 * `min-h-screen`, `overflow-hidden` and fixed 56px controls — so on a phone
 * the one page every tenant lands on was the one page that did not scale.
 *
 * It uses the shell now. What is genuinely its own stays here: remember-me,
 * the forgot link, and the gradient on the sign-in button.
 */

/** Checkbox, node 19:7431. Same shape when ticked. */
function CheckboxIcon({ checked }: { checked: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M7.75 17.5H12.25C16 17.5 17.5 16 17.5 12.25V7.75C17.5 4 16 2.5 12.25 2.5H7.75C4 2.5 2.5 4 2.5 7.75V12.25C2.5 16 4 17.5 7.75 17.5Z"
        fill={checked ? "#F5B800" : "#EAEAEA"}
      />
      {checked && (
        <path
          d="M6.75 10.1667L8.91667 12.3333L13.25 8"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which sign-in this is. The console and a shop use different accounts, and
  // the address decides which one you are looking at.
  //
  // Read with useSyncExternalStore, not an effect: the answer comes from the
  // browser address, which the server cannot know. This gives the server a
  // steady answer and the browser the real one, with no flash.
  const subscribe = () => () => {};
  const realm = useSyncExternalStore(subscribe, resolveRealm, () => "tenant" as const);
  const shop = useSyncExternalStore(subscribe, currentSubdomain, () => null);
  const isConsole = realm === "platform";
  // Resolved in the browser for the same reason the realm is: the host is the
  // input and the server does not have it. The server-rendered value is the
  // relative path, which is what this was before and is correct on the apex.
  const signupHref = useSyncExternalStore(
    subscribe,
    () => platformHref("/signup"),
    () => "/signup"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const session = await AuthService.login({ email, password });
      // Back to wherever the guard stopped them, or to their own home page: a
      // cashier has no back office, so they go to /pos.
      const next = new URLSearchParams(window.location.search).get("next");
      const home = resolveRealm() === "platform" ? "/platform" : session.home;
      // A real page load, not router.replace. The browser only offers to save
      // the password when a form submit is followed by one, and it makes the
      // app read the new session fresh.
      window.location.assign(next && next.startsWith("/") ? next : home);
    } catch (err) {
      // Stay here and say what went wrong. Redirecting anyway is what let
      // people into the app without an account.
      setError(AuthService.describeError(err));
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title={isConsole ? "Platform console" : "Welcome back"}
      subtitle={
        isConsole
          ? "For SortPi staff. Shop accounts sign in at their own company address."
          : shop
            ? `Sign in to ${shop}.`
            : "Sign in to continue to your SortPi workspace."
      }
      onSubmit={handleSubmit}
      footer={
        !isConsole ? (
          <span className="text-center">
            New company?{" "}
            {/*
              An <a> to the PLATFORM, not a <Link> to "/signup".

              Registering a company is the platform's job. On
              `nusrat.sortpi.com` a relative "/signup" kept the person on
              Nusrat's front door, so somebody creating their OWN new company
              did it from inside an existing customer's address — and every
              step after it, including the address the finished account is told
              to sign in at, was resolved against the wrong host.

              `platformHref` returns the plain relative path when subdomains are
              switched off, so a single-tenant deployment is unchanged.
            */}
            <a href={signupHref} className="cursor-pointer font-medium text-[#f5b800]">
              Create an account
            </a>
          </span>
        ) : undefined
      }
    >
      <div className="flex w-full flex-col items-start gap-[clamp(12px,3.2vw,16px)]">
        <AuthField
          label="Email"
          id="email"
          name="email"
          // Password managers look for these. Without them the browser does
          // not see a sign-in form and never offers to save.
          autoComplete="username"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="samcurrent@gmail.com"
          required
        />

        <AuthField
          label="Password"
          id="password"
          name="password"
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="********"
          required
        />

        <div className="flex w-full flex-wrap items-center justify-between gap-[8px]">
          <label className="flex cursor-pointer items-center justify-center gap-[6px]">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="sr-only"
            />
            <span className="flex size-[20px] shrink-0 items-center justify-center">
              <CheckboxIcon checked={rememberMe} />
            </span>
            <span className="text-[clamp(13px,3.2vw,14px)] leading-[1.5] font-normal tracking-[-0.28px] whitespace-nowrap text-[#525252]">
              Remember Me
            </span>
          </label>

          <Link
            href={isConsole ? "/platform/forgot-password" : "/forgot-password"}
            className="cursor-pointer text-[clamp(13px,3.2vw,14px)] leading-[1.5] font-medium tracking-[-0.28px] whitespace-nowrap text-[#f5b800]"
          >
            Forgot Password ?
          </Link>
        </div>
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      {/*
        Not AuthButton: this one carries the gradient the frame specifies, and
        a spinner in place of its label while the request is out.
      */}
      <button
        type="submit"
        disabled={isLoading}
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 100%), linear-gradient(90deg, rgb(245, 184, 0) 0%, rgb(245, 184, 0) 100%)",
        }}
        className="flex h-[clamp(48px,12vw,56px)] w-full cursor-pointer items-center justify-center rounded-[12px] px-[16px] py-[8px] text-[clamp(15px,3.9vw,18px)] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading ? (
          <span className="size-[20px] animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          "Sign In"
        )}
      </button>
    </AuthShell>
  );
}
