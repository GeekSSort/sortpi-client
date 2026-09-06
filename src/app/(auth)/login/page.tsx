"use client";

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";

import { AuthService } from "@/services";
import { resolveRealm, currentSubdomain } from "@/services/apiClient";

/**
 * Login — Figma 19:7398.
 * Sizes match the frame: a 549x563 card, 24px padding and gaps, a 501px
 * column, 56px controls.
 */

/** Eye with a slash, node 19:7428. */
function EyeDisableIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M3.33338 3.33333L16.6667 16.6667M11.6667 11.8634C11.2244 12.2593 10.6403 12.5 10.0001 12.5C8.61934 12.5 7.50005 11.3807 7.50005 10C7.50005 9.3597 7.74076 8.77563 8.13663 8.33333M16.3399 13.0064C16.816 12.5919 17.2419 12.1749 17.6086 11.7891C18.575 10.7724 18.575 9.22764 17.6086 8.21092C15.9788 6.49611 13.1796 4.16667 10.0001 4.16667C9.25724 4.16667 8.53519 4.2938 7.84397 4.51053M5.41672 5.66949C4.20125 6.44536 3.16475 7.39732 2.39147 8.21091C1.42513 9.22764 1.42513 10.7724 2.39147 11.7891C4.02129 13.5039 6.82045 15.8333 10.0001 15.8333C11.5568 15.8333 13.0223 15.2749 14.3041 14.5037"
        stroke="#525252"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The same eye without the slash. */
function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M17.6086 8.21092C18.575 9.22764 18.575 10.7724 17.6086 11.7891C15.9788 13.5039 13.1796 15.8333 10.0001 15.8333C6.82045 15.8333 4.02129 13.5039 2.39147 11.7891C1.42513 10.7724 1.42513 9.22764 2.39147 8.21091C4.02129 6.49611 6.82045 4.16667 10.0001 4.16667C13.1796 4.16667 15.9788 6.49611 17.6086 8.21092Z"
        stroke="#525252"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12.5001 10C12.5001 11.3807 11.3808 12.5 10.0001 12.5C8.61934 12.5 7.50005 11.3807 7.50005 10C7.50005 8.61929 8.61934 7.5 10.0001 7.5C11.3808 7.5 12.5001 8.61929 12.5001 10Z"
        stroke="#525252"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#FDFDFD] p-4">
      {/* Amber dot lattice on a 40px grid, masked so it fades from the centre out to the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(#F5B800 2px, transparent 2px)",
          backgroundSize: "40px 40px",
          backgroundPosition: "center",
          opacity: 0.7,
          maskImage:
            "radial-gradient(ellipse 85% 85% at 50% 50%, #000 0%, #000 45%, transparent 95%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 85% at 50% 50%, #000 0%, #000 45%, transparent 95%)",
        }}
      />

      {/* Login card — 549x563, radius 10, 24px padding, 24px gap */}
      <form
        onSubmit={handleSubmit}
        className="relative flex w-full max-w-[549px] flex-col items-center gap-[24px] rounded-[10px] bg-white p-[24px] shadow-[0px_0px_28px_0px_rgba(207,207,207,0.16),inset_0px_0px_1px_0px_rgba(0,0,0,0.25)]"
      >
        {/* image 6 — 106x100, radius 24 */}
        <Image
          src="/auth/logo.png"
          alt="SortPoint"
          width={106}
          height={100}
          priority
          className="h-[100px] w-[106px] shrink-0 rounded-[24px] object-cover"
        />

        {/* Headline — gap 8 */}
        <div className="flex w-full flex-col items-center gap-[8px]">
          <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.72px] text-[#1e1e1e]">
            {isConsole ? "Platform console" : "Welcome back"}
          </h1>
          <p className="text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252]">
            {isConsole
              ? "For SORTPoint staff. Shop accounts sign in at their own company address."
              : shop
                ? `Sign in to ${shop}.`
                : "Sign in to continue to your SortPoint workspace."}
          </p>
        </div>

        {/* Field — gap 16 */}
        <div className="flex w-full flex-col items-start gap-[16px]">
          {/* Email — gap 8 */}
          <div className="flex w-full flex-col items-start gap-[8px]">
            <label
              htmlFor="email"
              className="w-full text-[18px] leading-[24px] font-medium text-[#525252]"
            >
              Email
            </label>
            <div className="flex h-[56px] w-full items-center rounded-[12px] border border-solid border-[#f5b800] bg-white px-[16px] py-[8px]">
              <input
                id="email"
                name="email"
                // Password managers look for these. Without them the browser
                // does not see a sign-in form and never offers to save.
                autoComplete="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="samcurrent@gmail.com"
                required
                className="min-w-px flex-1 bg-transparent text-[16px] leading-[24px] font-normal text-[#525252] outline-none placeholder:text-[#525252]"
              />
            </div>
          </div>

          {/* Password — gap 8 */}
          <div className="flex w-full flex-col items-start gap-[8px]">
            <label
              htmlFor="password"
              className="w-full text-[18px] leading-[24px] font-medium text-[#525252]"
            >
              Password
            </label>
            <div className="flex w-full flex-col items-start">
              <div className="flex h-[56px] w-full items-center rounded-[12px] bg-[#eaeaea] px-[16px] py-[8px]">
                <div className="flex min-w-px flex-1 items-center justify-between gap-[16px]">
                  <input
                    id="password"
                    name="password"
                    autoComplete="current-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                    required
                    className="min-w-px flex-1 bg-transparent text-[16px] leading-[24px] font-normal text-[#525252] outline-none placeholder:text-[#525252]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="flex size-[20px] shrink-0 items-center justify-center"
                  >
                    {showPassword ? <EyeIcon /> : <EyeDisableIcon />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="flex w-full items-center justify-between">
            <label className="flex items-center justify-center gap-[6px] select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="sr-only"
              />
              <span className="flex size-[20px] shrink-0 items-center justify-center">
                <CheckboxIcon checked={rememberMe} />
              </span>
              <span className="text-[14px] leading-[1.5] font-normal tracking-[-0.28px] whitespace-nowrap text-[#525252]">
                Remember Me
              </span>
            </label>

            <Link
              href={isConsole ? "/platform/forgot-password" : "/forgot-password"}
              className="cursor-pointer text-[14px] leading-[1.5] font-medium tracking-[-0.28px] whitespace-nowrap text-[#f5b800]"
            >
              Forgot Password ?
            </Link>
          </div>
        </div>

        {!isConsole && (
          <p className="w-full text-center text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252]">
            New company?{" "}
            <Link href="/signup" className="cursor-pointer font-medium text-[#f5b800]">
              Create an account
            </Link>
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="w-full rounded-[10px] bg-[#fdeceb] px-[16px] py-[12px] text-[14px] leading-[1.5] font-medium text-[#a02620]"
          >
            {error}
          </p>
        )}

        {/* Sign In */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 100%), linear-gradient(90deg, rgb(245, 184, 0) 0%, rgb(245, 184, 0) 100%)",
          }}
          className="flex h-[56px] w-full items-center justify-center rounded-[12px] px-[16px] py-[8px] text-[18px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? (
            <span className="size-[20px] animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            "Sign In"
          )}
        </button>
      </form>
    </div>
  );
}
