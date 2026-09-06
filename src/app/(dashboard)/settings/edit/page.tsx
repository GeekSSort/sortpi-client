"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, CheckCircle2 } from "lucide-react";
import { SettingsService } from "@/services";
import { CompanyProfile } from "@/types/settings";
import { useQuery, queryKey, useMutation } from "@/lib/query/useQuery";
import { FormSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";

/**
 * Blank, not a specimen company. This form opened on "ABC Retail Ltd." with a
 * Banani address and a TIN typed in as `useState` defaults, so a shop that had
 * saved nothing saw somebody else's details and could PATCH them over its own
 * organization record without touching a key.
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

export default function EditProfilePage() {
  const router = useRouter();
  // Only what has been TYPED lives in state; the saved record stays in the
  // cache. Copying it into state needed an effect to seed it, and that effect
  // either discarded unsaved edits on a background refresh or had to be
  // guarded into never running twice.
  const [edits, setEdits] = useState<Partial<CompanyProfile>>({});
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Same key as the Company Profile screen, so arriving here after reading it
  // paints the saved record immediately instead of re-fetching behind a form.
  const { data, loading, fetching, error, refetch } = useQuery(
    queryKey("settings", { part: "company" }),
    () => SettingsService.getCompanyProfile()
  );

  const saved = data === undefined ? null : data ?? BLANK_PROFILE;
  const profile = saved === null ? null : { ...saved, ...edits };

  const { mutate: saveProfile, pending: isSaving, error: saveError } = useMutation(
    (payload: CompanyProfile) => SettingsService.updateCompanyProfile(payload),
    // The receipt header and the Company Profile screen both read this.
    { invalidates: ["settings"] }
  );

  const handleFieldChange = (field: keyof CompanyProfile, value: string) => {
    setEdits((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      await saveProfile(profile);
      setSavedSuccess(true);
      setTimeout(() => {
        router.push("/settings");
      }, 1200);
    } catch {
      // Rendered under the form. A console-only catch left "Update Profile"
      // looking as though it had worked.
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 pb-12">
      {/* Top Page Header Section */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
          Edit Profile
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          Manage your company information, branding, contact details, and business settings.
        </p>
      </div>

      {/* Centered Form Container */}
      <div className="mx-auto w-full max-w-[560px]">
        <form onSubmit={handleSave} className="relative bg-white rounded-2xl border border-gray-200/90 p-6 sm:p-8 flex flex-col gap-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <RefreshBar active={fetching} />
          <QueryBoundary
            loading={loading}
            error={error}
            hasData={profile !== null}
            skeleton={<FormSkeleton fields={8} columns={1} />}
            errorMessage="Could not load the company profile."
            onRetry={refetch}
          >
          {profile && (
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

          {/* 5. Website */}
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

          {/* 7. Tax ID / BIN */}
          <div>
            <label className="text-xs font-bold text-gray-800 block mb-1.5">
              Tax ID / BIN
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

          {/* 9. Upload Image Box */}
          <div>
            <label className="w-full border border-gray-200 hover:border-gray-300 rounded-xl py-6 flex items-center justify-center gap-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50/70 transition-colors cursor-pointer">
              <input type="file" accept="image/*" className="hidden" />
              <CloudUpload className="w-5 h-5 text-gray-700" />
              <span>Upload Image</span>
            </label>
          </div>

          {/* A refused PATCH has to be said out loud, not logged */}
          {saveError !== undefined && !savedSuccess && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700"
            >
              {saveError instanceof Error && saveError.message
                ? saveError.message
                : "The profile could not be updated."}
            </div>
          )}

          {/* Success Notification */}
          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Profile updated successfully! Redirecting...</span>
            </div>
          )}

          {/* Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3.5 bg-[#F4B41A] hover:bg-[#E5A612] text-white font-bold rounded-xl text-xs sm:text-sm transition-all shadow-xs text-center cursor-pointer disabled:opacity-60"
            >
              {isSaving ? "Updating Profile..." : "Update Profile"}
            </button>
          </div>
            </>
          )}
          </QueryBoundary>
        </form>
      </div>
    </div>
  );
}

