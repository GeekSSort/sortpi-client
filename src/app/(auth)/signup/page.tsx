"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell, { AuthAlert, AuthButton, AuthField } from "@/components/auth/AuthShell";
import { PublicPlan, RegistrationService } from "@/services/registrationService";
import { platformHref, useOnTenantHost } from "@/lib/realmUrl";

/**
 * A new company signs itself up.
 *
 * This page runs on the MAIN site, not on a company address — the company does
 * not have one yet, which is the whole point of the form. The address they
 * choose here becomes theirs once the password is set.
 *
 * It ENFORCES that rather than assuming it. Fixing the "Create an account"
 * link on the sign-in page stops one route onto a company address; a bookmark,
 * a shared link, a typed URL and a search result are the others, and on
 * `nusrat.sortpi.com/signup` every request this page makes goes to Nusrat's
 * API host — including the availability check, whose answer would then be
 * about a tenant front door rather than about the platform.
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
  /**
   * On a company's address this form does not belong here at all.
   *
   * Sent with `replace`, so Back does not bounce between the two hosts, and
   * from an effect rather than during render because the host is a browser
   * fact the server render cannot have. `platformHref` is the relative path
   * when subdomains are off, and `onTenantHost` is false there too, so a
   * single-tenant deployment never enters this branch.
   */
  const wrongHost = useOnTenantHost();
  useEffect(() => {
    // The navigation is the side effect; the boolean above is read, not set.
    // `replace`, so Back does not bounce between the two hosts.
    if (wrongHost) window.location.replace(platformHref("/signup"));
  }, [wrongHost]);

  /**
   * Two steps: who you are, then what your company is.
   *
   * One column of five fields was taller than a laptop viewport, so the person
   * scrolled to reach the button and could not see what they had typed while
   * reading the web-address hint underneath it. Widening the card fixed the
   * height and made a five-field form look like a spreadsheet.
   *
   * Splitting it is the better answer because the two halves are genuinely
   * different questions — a person, and a business — and the second one has
   * the field that needs the most explaining. Nothing is SENT until step two
   * is submitted: `startSignup` is one request carrying both halves, and
   * `apps/accounts/registration.py` deliberately creates nothing before the
   * emailed code comes back.
   */
  const [step, setStep] = useState<1 | 2>(1);
  /**
   * Which plan they are signing up on.
   *
   * Blank means "the platform's default", which is what every sign-up did
   * before this existed and what a client that does not send one still gets.
   * The list is PUBLIC and ACTIVE only, the same filter the server validates
   * against, so nothing offered here can be refused for being offered.
   */
  const [planCode, setPlanCode] = useState("");
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether the address is already registered, checked while it is typed.
   *
   * Debounced, like the web-address check beside it: a request per keystroke
   * would be a request per keystroke, and the answer only matters once they
   * have stopped.
   */
  //
  // Held as "the answer, and which address it was about" rather than as a
  // display state. A field the person is still typing into has no answer yet,
  // and DERIVING that beats setting "idle" from the effect — a synchronous
  // setState in an effect body is a cascading render on every keystroke.
  const [emailAnswer, setEmailAnswer] = useState<{
    address: string;
    available: boolean;
    reason?: string | null;
  } | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
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
    // Nothing to check until the company step is on screen.
    if (step !== 2) return;
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
  }, [subdomain, step]);

  useEffect(() => {
    // Fetched when the company step opens, not on mount: somebody who never
    // reaches step two never asks for a price list.
    if (step !== 2 || plans.length > 0) return;
    let cancelled = false;
    void RegistrationService.publicPlans()
      .then((rows) => {
        if (cancelled) return;
        setPlans(rows);
        // Preselect the cheapest, so the field is never empty-looking on a
        // form that is about to be submitted.
        if (!planCode && rows.length) {
          setPlanCode([...rows].sort((a, b) => a.price - b.price)[0].code);
        }
      })
      .catch(() => {
        // A price list that will not load must not stop a sign-up: leaving
        // `planCode` blank provisions on the platform's default, which is
        // exactly what happened before plans were choosable.
      });
    return () => {
      cancelled = true;
    };
  }, [step, plans.length, planCode]);

  useEffect(() => {
    const value = email.trim();
    if (step !== 1 || !value.includes("@")) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setEmailChecking(true);
      void RegistrationService.checkEmail(value)
        .then((answer) => {
          if (cancelled) return;
          setEmailAnswer({
            address: value,
            available: answer.available,
            reason: answer.reason,
          });
        })
        .catch(() => {
          // A check that cannot run must not block a sign-up: the submit still
          // refuses a taken address with EMAIL_IN_USE, which is the answer
          // that actually decides it.
        })
        .finally(() => {
          if (!cancelled) setEmailChecking(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, step]);

  /** What to show under the email box, derived rather than stored. */
  const emailState: "idle" | "checking" | "free" | "taken" = (() => {
    const value = email.trim();
    if (step !== 1 || !value.includes("@")) return "idle";
    if (emailAnswer?.address === value) return emailAnswer.available ? "free" : "taken";
    return emailChecking ? "checking" : "idle";
  })();

  const onCompanyName = (value: string) => {
    setCompanyName(value);
    // Suggest the address from the name until they change it themselves.
    if (!subdomainEdited) setSubdomain(slugify(value));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Step one only moves the form on: nothing is sent, and nothing is created
    // on the server until the emailed code comes back either.
    if (step === 1) {
      setError(null);
      setStep(2);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await RegistrationService.startSignup({
        companyName: companyName.trim(),
        subdomain: subdomain.trim(),
        ownerName: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        planCode: planCode || undefined,
      });
      router.push(
        `/verify-code?email=${encodeURIComponent(email.trim())}&purpose=signup&subdomain=${encodeURIComponent(subdomain.trim())}`
      );
    } catch (err) {
      setError(RegistrationService.describeError(err));
      setBusy(false);
    }
  };

  if (wrongHost) {
    return (
      <AuthShell
        title="Taking you to the right place"
        subtitle="A new company signs up on the main SortPi site, not on another company's address."
      >
        <p className="w-full text-center text-[13px] text-[#737373]">
          <a href={platformHref("/signup")} className="font-medium text-[#f5b800]">
            Continue
          </a>
        </p>
      </AuthShell>
    );
  }

  // A taken address stops step one rather than step two: continuing would mean
  // choosing a company name and a web address that are about to be thrown away.
  const personalDone = Boolean(ownerName.trim() && email.trim() && emailState !== "taken");
  const companyDone = Boolean(companyName.trim() && subdomain.trim().length >= 3);

  return (
    <AuthShell
      // The heading names the PRODUCT, not the form's own internals. "About
      // you" is a section label from a spec — it tells somebody who has just
      // arrived nothing about where they are or what they are starting.
      title={step === 1 ? "Register with SortPi" : "Set up your company"}
      subtitle={
        step === 1
          ? "Step 1 of 2 — your details. We will email a code to confirm it is you."
          : "Step 2 of 2 — your shop. This is the address your staff will sign in at."
      }
      onSubmit={submit}
      /**
       * Wider than a one-column card, narrower than the 720 the single-page
       * version needed: two or three fields a step fit above the fold at 560
       * with the name and email side by side.
       */
      width={560}
      /*
       * No "Already have an account? Sign in".
       *
       * This page is on the PLATFORM address, and the sign-in there is the
       * staff console — not where a shopkeeper belongs. Their sign-in is their
       * own company address, which this form does not know yet, so the link
       * could only ever point somewhere wrong.
       */
    >
      {step === 1 ? (
        <div className="grid w-full grid-cols-1 items-start gap-x-[16px] gap-y-[16px] sm:grid-cols-2">
          <AuthField
            label="Your name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Nusrat Rahman"
            autoComplete="name"
            required
          />

          <AuthField
            label="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+8801700000000"
            autoComplete="tel"
          />

          <div className="sm:col-span-2">
            <AuthField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
              hint={
                <>
                  We send your confirmation code here, so use an address you can
                  open now.
                  {emailState === "checking" && (
                    <span className="ml-1 text-[#8a8a8a]">Checking…</span>
                  )}
                  {emailState === "free" && (
                    <span className="ml-1 font-medium text-[#1a8f4c]">Available.</span>
                  )}
                  {emailState === "taken" && (
                    <span className="ml-1 font-medium text-[#c0392b]">
                      {emailAnswer?.reason || "Already registered."}
                    </span>
                  )}
                </>
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col items-start gap-[16px]">
          <AuthField
            label="Company name"
            value={companyName}
            onChange={(e) => onCompanyName(e.target.value)}
            placeholder="Rahman Stores"
            autoComplete="organization"
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
                  {subdomain || "yourname"}.sortpi.com
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

          {plans.length > 0 && (
            <div className="flex w-full flex-col gap-[8px]">
              <span className="text-[18px] leading-[24px] font-medium text-[#525252]">
                Plan
              </span>
              <div className="grid w-full grid-cols-1 gap-[8px] sm:grid-cols-2">
                {plans.map((plan) => {
                  const chosen = plan.code === planCode;
                  const limit = (n: number | null) => (n === null ? "Unlimited" : String(n));
                  return (
                    <button
                      key={plan.code}
                      type="button"
                      onClick={() => setPlanCode(plan.code)}
                      className={`flex cursor-pointer flex-col items-start gap-[4px] rounded-[12px] border border-solid p-[12px] text-left transition-colors ${
                        chosen
                          ? "border-[#f5b800] bg-[#fffdf5]"
                          : "border-[#eaeaea] bg-white hover:bg-[#fafafa]"
                      }`}
                    >
                      <span className="flex w-full items-baseline justify-between gap-[8px]">
                        <span className="text-[15px] font-semibold text-[#1e1e1e]">
                          {plan.name}
                        </span>
                        <span className="text-[13px] font-medium text-[#525252]">
                          ৳{plan.price.toLocaleString("en-IN")}/
                          {plan.interval.toLowerCase() === "yearly" ? "yr" : "mo"}
                        </span>
                      </span>
                      <span className="text-[12px] leading-[1.5] text-[#8f8d87]">
                        {limit(plan.maxBranches)} branches · {limit(plan.maxUsers)} people ·{" "}
                        {limit(plan.maxProducts)} products
                      </span>
                      {plan.trialDays > 0 && (
                        <span className="text-[12px] font-medium text-[#16a34a]">
                          {plan.trialDays}-day free trial
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <span className="text-[13px] leading-[1.4] text-[#737373]">
                You can move up a plan at any time from Settings. Moving down is
                a conversation with us, because it means deciding what happens
                to whatever no longer fits.
              </span>
            </div>
          )}
        </div>
      )}

      {error && <AuthAlert>{error}</AuthAlert>}

      {step === 1 ? (
        <AuthButton type="submit" disabled={!personalDone}>
          Continue
        </AuthButton>
      ) : (
        <div className="flex w-full items-center gap-[12px]">
          {/*
            Back keeps everything typed — it changes which half is on screen
            and nothing else. A wizard that empties the first step when you
            check something on the second is a wizard people stop trusting.
          */}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(1);
            }}
            className="flex h-[56px] shrink-0 cursor-pointer items-center justify-center rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[24px] text-[16px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
          >
            Back
          </button>
          <AuthButton
            type="submit"
            disabled={busy || !companyDone || addressCheck.state === "taken"}
          >
            {busy ? "Sending code…" : "Send me a code"}
          </AuthButton>
        </div>
      )}
    </AuthShell>
  );
}
