"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SettingsService } from "@/services";
import { tokenStore } from "@/services/apiClient";
import { CompanyProfile } from "@/types/settings";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { FormSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import {
  PAYMENT_METHOD_CATALOGUE,
  findPaymentMethod,
  parseOnlineMethods,
  serializeOnlineMethods,
} from "@/lib/paymentMethods";

/**
 * Every field blank. The form used to open on a made-up company — "ABC Retail
 * Ltd.", a Banani address, a TIN — so an account with nothing saved read as
 * one that was already configured, and pressing Save wrote that fiction to the
 * organization record.
 */
const BLANK_PROFILE: CompanyProfile = {
  companyName: "",
  businessType: "",
  companyEmail: "",
  phoneNumber: "",
  address: "",
  website: "",
  taxId: "",
  tradeLicenseBin: "",
  currency: "",
  logoUrl: "",
};

type TillSettings = {
  vat: string;
  vatIncluded: boolean;
  maxDiscount: string;
  /** The non-cash tenders the till offers, in the order it shows them. */
  onlineMethods: string[];
};

export default function SettingsPage() {
  // Only what has been TYPED lives in state; the saved record stays in the
  // cache. Copying the fetched record into state needed an effect to seed it,
  // and that effect either clobbered half-typed edits on every background
  // refresh or had to be guarded into never running twice.
  const [profileEdits, setProfileEdits] = useState<Partial<CompanyProfile>>({});
  // Percentages here, fractions on the wire: the server stores 0.15 for 15%.
  const [tillEdits, setTillEdits] = useState<Partial<TillSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const branchId = tokenStore.branch();
  const profileQuery = useQuery(
    queryKey("settings", { part: "company" }),
    () => SettingsService.getCompanyProfile()
  );
  // `/settings/resolved/` answers for the branch you are standing in, so the
  // branch belongs in the key or one branch's VAT rate would be served to
  // another's till.
  const valuesQuery = useQuery(
    queryKey("settings", { part: "values", branch: branchId }),
    () => SettingsService.getValues()
  );

  const savedProfile = profileQuery.data === undefined ? null : profileQuery.data ?? BLANK_PROFILE;

  const savedTill: TillSettings | null = React.useMemo(() => {
    const v = valuesQuery.data;
    if (v === undefined) return null;
    // Empty rather than a plausible 15, so an unconfigured rate looks unset
    // instead of looking like a rate the till is already applying.
    const pct = (raw: string) => {
      const n = Number(raw);
      return raw !== undefined && raw !== "" && Number.isFinite(n)
        ? String(+(n * 100).toFixed(2))
        : "";
    };
    return {
      vat: pct(v["tax.default_rate"]),
      vatIncluded: String(v["tax.inclusive_by_default"] ?? "true") !== "false",
      maxDiscount: pct(v["pos.max_discount_percent"]),
      onlineMethods: parseOnlineMethods(v["pos.online_payment_methods"]),
    };
  }, [valuesQuery.data]);

  const profile = savedProfile === null ? null : { ...savedProfile, ...profileEdits };
  const till = savedTill === null ? null : { ...savedTill, ...tillEdits };

  const handleFieldChange = (field: keyof CompanyProfile, value: string) => {
    setProfileEdits((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * The boxes to show: the catalogue, then anything this shop saved that the
   * catalogue has never heard of.
   *
   * The second half is the reason this is not just the catalogue. The setting
   * was a free-text box before, so a shop may have "Due on delivery" in it,
   * and a grid of fixed checkboxes would drop that tender the first time
   * anybody pressed Save without ever showing it to them.
   */
  const methodRows = React.useMemo(() => {
    const known = PAYMENT_METHOD_CATALOGUE.map((option) => option.code);
    const custom = (savedTill?.onlineMethods ?? []).filter((m) => !findPaymentMethod(m));
    return [...known, ...custom];
  }, [savedTill]);

  const toggleMethod = (code: string) => {
    setTillEdits((prev) => {
      const current = prev.onlineMethods ?? savedTill?.onlineMethods ?? [];
      const isOn = current.some((m) => m.toLowerCase() === code.toLowerCase());
      const next = isOn
        ? current.filter((m) => m.toLowerCase() !== code.toLowerCase())
        : [...current, code];
      // Back into the order of the boxes, so the till lists tenders the way
      // this screen does rather than in whatever order they were ticked.
      const rank = new Map(methodRows.map((c, i) => [c.toLowerCase(), i]));
      next.sort(
        (a, b) =>
          (rank.get(a.toLowerCase()) ?? methodRows.length) -
          (rank.get(b.toLowerCase()) ?? methodRows.length)
      );
      return { ...prev, onlineMethods: next };
    });
  };

  const loading = profileQuery.loading || valuesQuery.loading;
  const error = profileQuery.error ?? valuesQuery.error;
  const ready = profile !== null && till !== null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !till) return;
    // Saving none would leave the till a Pay Online button with an empty
    // dialog behind it. Cash is always there; this list is everything else.
    if (till.onlineMethods.length === 0) {
      setSaveError("Tick at least one payment method \u2014 the till needs something to offer besides cash.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await SettingsService.updateCompanyProfile(profile);
      // Percent in the box, fraction in the setting.
      const asFraction = (value: string) => (Math.max(0, Number(value) || 0) / 100).toFixed(4);
      await Promise.all([
        SettingsService.setValue("tax.default_rate", asFraction(till.vat)),
        SettingsService.setValue("pos.max_discount_percent", asFraction(till.maxDiscount)),
        SettingsService.setValue(
          "tax.inclusive_by_default",
          till.vatIncluded ? "true" : "false",
          "BOOL"
        ),
        SettingsService.setValue(
          "pos.online_payment_methods",
          serializeOnlineMethods(till.onlineMethods),
          "STRING"
        ),
      ]);
      // The receipt header, the VAT rate and the discount cap all come from
      // here, so an open till has to hear about the change rather than keep
      // charging yesterday's rate until it is reloaded.
      invalidate("settings", "pos-products");
      // The typed-over values are the saved ones now, so the boxes go back to
      // showing whatever the refetch brings rather than a stale overlay.
      setProfileEdits({});
      setTillEdits({});
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      // Shown, not logged: "Save Changes" going quiet is indistinguishable
      // from a save that worked.
      setSaveError(
        err instanceof Error && err.message ? err.message : "The settings could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 pb-12">
      {/* Top Page Header Section */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
          Company Profile
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          Manage your company information, branding, contact details, and business settings.
        </p>
      </div>

      {/* Main Settings Container */}
      <form onSubmit={handleSave} className="flex flex-col lg:flex-row items-start gap-6">
        {/* Left Branding / Logo Card */}
        <div className="w-full lg:w-[280px] bg-white rounded-2xl border border-gray-200/90 p-8 flex flex-col items-center justify-center gap-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] shrink-0">
          <div className="w-[180px] h-[90px] relative flex items-center justify-center">
            <Image
              src="/image1.png"
              alt="ABCD Retailer Logo"
              fill
              className="object-contain"
              priority
            />
          </div>

          <Link
            href="/settings/edit"
            className="px-5 py-1.5 border border-amber-400 text-amber-500 hover:bg-amber-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Edit Profile
          </Link>
        </div>

        {/* Right Form Card */}
        <div className="relative flex-1 w-full bg-white rounded-2xl border border-gray-200/90 p-6 sm:p-8 flex flex-col gap-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <RefreshBar active={profileQuery.fetching || valuesQuery.fetching} />
          <QueryBoundary
            loading={loading}
            error={error}
            hasData={ready}
            skeleton={<FormSkeleton fields={9} columns={1} />}
            errorMessage="Could not load the company profile."
            onRetry={() => {
              void profileQuery.refetch();
              void valuesQuery.refetch();
            }}
          >
          {ready && (
            <>
          {/* 1. Company Name */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Company Name
            </label>
            <input
              type="text"
              value={profile.companyName}
              onChange={(e) => handleFieldChange("companyName", e.target.value)}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* 2. Business Type */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Business Type
            </label>
            <input
              type="text"
              value={profile.businessType}
              onChange={(e) => handleFieldChange("businessType", e.target.value)}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* 3. Company Email */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Company Email
            </label>
            <input
              type="email"
              value={profile.companyEmail}
              onChange={(e) => handleFieldChange("companyEmail", e.target.value)}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* 4. Phone Number */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Phone Number
            </label>
            <input
              type="text"
              value={profile.phoneNumber}
              onChange={(e) => handleFieldChange("phoneNumber", e.target.value)}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* 5. Address — printed at the top of every till receipt. */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Address
            </label>
            <input
              type="text"
              value={profile.address}
              onChange={(e) => handleFieldChange("address", e.target.value)}
              placeholder="Shown on receipts"
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* 6. Website */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Website
            </label>
            <input
              type="text"
              value={profile.website}
              onChange={(e) => handleFieldChange("website", e.target.value)}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* 6. Tax ID / BIN */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Tax ID / BIN
            </label>
            <input
              type="text"
              value={profile.taxId}
              onChange={(e) => handleFieldChange("taxId", e.target.value)}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* 7. Trade Licence */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Trade Licence No.
            </label>
            <input
              type="text"
              value={profile.tradeLicenseBin}
              onChange={(e) => handleFieldChange("tradeLicenseBin", e.target.value)}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* 8. Currency */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Currency
            </label>
            <input
              type="text"
              value={profile.currency}
              onChange={(e) => handleFieldChange("currency", e.target.value)}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* Till & tax — what the POS starts every sale with. */}
          <div className="sm:col-span-2 pt-2">
            <p className="text-sm font-bold text-gray-900">Till &amp; tax</p>
            <p className="text-xs text-gray-500 mt-0.5">
              The POS uses these on every sale. A supervisor can change the VAT on one
              sale at the till; this is what it goes back to.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Default VAT rate (%)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={till.vat}
              onChange={(e) => setTillEdits((t) => ({ ...t, vat: e.target.value.replace(/[^\d.]/g, "") }))}
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Maximum discount at the till (%)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={till.maxDiscount}
              onChange={(e) =>
                setTillEdits((t) => ({ ...t, maxDiscount: e.target.value.replace(/[^\d.]/g, "") }))
              }
              className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* The tenders this shop takes.
              Boxes rather than the comma-separated text box that used to be
              here: "Bkash", "bkash " and "BKASH" were three different methods
              to that box, and a typo removed a tender from the till without
              saying so. What is ticked here IS the "Pay Online" dialog. */}
          <div className="sm:col-span-2">
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Payment Methods (POS)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {methodRows.map((code) => {
                const option = findPaymentMethod(code);
                const checked = till.onlineMethods.some(
                  (m) => m.toLowerCase() === code.toLowerCase()
                );
                return (
                  <label
                    key={code}
                    className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 cursor-pointer transition-colors ${
                      checked
                        ? "border-amber-400 bg-amber-50/60"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMethod(code)}
                      className="size-4 accent-[#F4B41A] cursor-pointer shrink-0"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs font-bold text-gray-800 truncate">
                        {option?.label ?? code}
                      </span>
                      <span className="text-[11px] text-gray-500 truncate">
                        {option?.hint ?? "Set up by this shop"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              Ticked methods are what the cashier sees in the &quot;Pay Online&quot; dialog at
              the till, in this order. Cash is always accepted and has its own button.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2.5 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={till.vatIncluded}
                onChange={(e) => setTillEdits((t) => ({ ...t, vatIncluded: e.target.checked }))}
                className="size-4 accent-[#F4B41A] cursor-pointer"
              />
              <span className="text-xs font-bold text-gray-800">
                Shelf prices already include VAT
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              On: the price on the label is what the customer pays, and the VAT is taken
              out of it. Off: VAT is added at the till.
            </p>
          </div>

          {/* A failed save must say so — it used to go only to the console. */}
          {saveError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700"
            >
              {saveError}
            </div>
          )}

          {/* Success Message */}
          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Settings saved successfully!</span>
            </div>
          )}

          {/* Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-[#F4B41A] hover:bg-[#E5A612] text-white font-bold rounded-xl text-xs sm:text-sm shadow-xs transition-all cursor-pointer disabled:opacity-60"
            >
              {isSaving ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
            </>
          )}
          </QueryBoundary>
        </div>
      </form>
    </div>
  );
}
