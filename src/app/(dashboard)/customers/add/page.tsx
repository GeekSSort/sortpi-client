"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import { CustomerService } from "@/services";
import { useMutation } from "@/lib/query/useQuery";

export default function AddCustomerPage() {
  const router = useRouter();
  // Empty, not a sample person. The form used to open pre-filled with a
  // plausible name, type and phone number, and pressing the button without
  // touching a field created that invented customer for real.
  const [customerName, setCustomerName] = useState("");
  const [customerType, setCustomerType] = useState<"Regular" | "VIP" | "Premium">("Regular");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  // A new customer shows up in the directory and in the dashboard's customer
  // count the moment this resolves, on whichever screens are already mounted.
  const { mutate: createCustomer, pending: isSubmitting, error } = useMutation(
    (payload: Parameters<typeof CustomerService.createCustomer>[0]) =>
      CustomerService.createCustomer(payload),
    { invalidates: ["customers", "dashboard"] }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phoneNumber.trim()) return;

    try {
      await createCustomer({
        name: customerName,
        phone: phoneNumber,
        type: customerType,
        status: "Active",
      });

      setSuccessMessage(true);
      setTimeout(() => {
        router.push("/customers");
      }, 1400);
    } catch {
      // The failure is rendered below rather than swallowed into the console —
      // a silent catch left the form looking as though nothing had happened.
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 pb-12">
      {/* Top Title & Subtitle */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
          Add Customer
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          Create a new customer profile and save their information.
        </p>
      </div>

      {/* Centered Form Container */}
      <div className="mx-auto w-full max-w-[560px] flex flex-col gap-5 pt-2">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Card Form Box */}
          <div className="bg-white rounded-2xl border border-gray-200/90 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
            {/* Header */}
            <div className="py-3 px-4 text-center border-b border-gray-100 bg-white">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-800">
                Add New Customer
              </h3>
            </div>

            {/* Form Fields */}
            <div className="p-6 flex flex-col gap-4">
              {/* 1. Customer Name */}
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1.5">
                  Customer Name
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name"
                  className="w-full border border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
                />
              </div>

              {/* 2. Customer Type */}
              <div className="relative">
                <label className="text-xs font-bold text-gray-800 block mb-1.5">
                  Customer Type
                </label>
                <button
                  type="button"
                  onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                  className="w-full border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="font-medium">{customerType}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {isTypeDropdownOpen && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-30">
                    {(["Regular", "VIP", "Premium"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setCustomerType(t);
                          setIsTypeDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-amber-50 hover:text-[#F4B41A] ${
                          customerType === t ? "font-bold text-[#F4B41A]" : "text-gray-700"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Phone Number */}
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1.5">
                  Phone Number
                </label>
                <input
                  type="text"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+880 1542-34790"
                  className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Failure has to be visible, or the button just looks unresponsive */}
          {error !== undefined && !successMessage && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 text-center"
            >
              {error instanceof Error && error.message
                ? error.message
                : "The customer could not be added. Please try again."}
            </div>
          )}

          {/* Success Notification */}
          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700 flex items-center justify-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Customer added successfully! Redirecting...</span>
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 bg-[#F4B41A] hover:bg-[#E5A612] text-white font-bold rounded-xl text-xs sm:text-sm transition-all shadow-xs text-center cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? "Adding Customer..." : "Add Customer"}
          </button>
        </form>
      </div>
    </div>
  );
}

