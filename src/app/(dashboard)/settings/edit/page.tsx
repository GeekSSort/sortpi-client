"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, CheckCircle2 } from "lucide-react";
import { SettingsService } from "@/services";
import { CompanyProfile } from "@/types/settings";

export default function EditProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CompanyProfile>({
    companyName: "ABC Retail Ltd.",
    businessType: "Private Limited",
    companyEmail: "info@abcretail.com",
    phoneNumber: "+880 1712-345678",
    address: "Road-15, Block-D, House-50, Banani, Dhaka-1213",
    website: "www.abcretail.com",
    taxId: "123456789",
    tradeLicenseBin: "123456789",
    currency: "BDT — Bangladeshi Taka",
    logoUrl: "/image1.png",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  React.useEffect(() => {
    SettingsService.getCompanyProfile().then((data) => {
      if (data) setProfile(data);
    });
  }, []);

  const handleFieldChange = (field: keyof CompanyProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await SettingsService.updateCompanyProfile(profile);
      setSavedSuccess(true);
      setTimeout(() => {
        router.push("/settings");
      }, 1200);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 pb-12 select-none">
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
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200/90 p-6 sm:p-8 flex flex-col gap-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
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
        </form>
      </div>
    </div>
  );
}

