"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SettingsService, UnitsService, UnitOption, CouponService } from "@/services";
import type { CouponInput } from "@/services";
import { tokenStore } from "@/services/apiClient";
import { CompanyProfile } from "@/types/settings";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { FormSkeleton } from "@/components/shared/Skeleton";
import {
  ACTIVE_STOCK_TYPE_KEY,
  STOCK_TYPE_PRESETS,
  presetAlreadyAdded,
  type StockTypePreset,
} from "@/lib/stockTypes";
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
  /** May a cashier take less than the bill and put the rest on account? */
  allowPartial: boolean;
  /** Does an additional payment at the till carry VAT? */
  surchargeTaxable: boolean;
  /** May a cashier TYPE a quantity at the till, or only step it? */
  manualQuantity: boolean;
  /** Is the payable rounded to a whole taka (.40 and up rounds up)? */
  roundToWhole: boolean;
  /**
   * The customer points scheme. Every rule the till follows lives here —
   * nothing about points is decided in the POS.
   */
  loyaltyEnabled: boolean;
  /** "Every ৳100 spent = 1 point" is these two together. */
  earnPerAmount: string;
  earnPoints: string;
  /** What the spend is measured on. See the radio group for why it matters. */
  earnBasis: "NET_PAYABLE" | "DISCOUNTED" | "SUBTOTAL";
  /** FLAT: "100 points = ৳50 off". PERCENT: "100 points = 1% off". */
  redeemMode: "FLAT" | "PERCENT";
  redeemPoints: string;
  /** What a block is worth under FLAT. */
  redeemValue: string;
  /** What a block is worth under PERCENT, as a share of the bill. */
  redeemPercent: string;
  /** The floor before any points can be spent at all. */
  minRedeemPoints: string;
  /** Whole blocks, or any amount above the floor? */
  allowPartialRedeem: boolean;
  /** A ceiling per sale. Blank or 0 means none. */
  maxRedeemPerSale: string;
};

const TABS = [
  { key: "company", label: "Company", hint: "Name, contact and licence details" },
  { key: "till", label: "Till & tax", hint: "What the POS starts every sale with" },
  { key: "payments", label: "Payments", hint: "Tenders, part payment and surcharges" },
  { key: "loyalty", label: "Customer points", hint: "Earning and redemption rules" },
  { key: "units", label: "Stock types", hint: "What your stock is counted in" },
  { key: "coupons", label: "Coupons", hint: "Codes you hand out, and what they take off" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** One switch and the sentence explaining it — the shape this page repeats. */
/**
 * A whole-number rule, in this page's own field.
 *
 * Held as TEXT, like every other number on this screen: a controlled number
 * round-trips through Number() on each keystroke, so clearing a box to retype
 * it puts a 0 back under the cursor.
 */
function NumberBox({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-gray-800 block mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className="w-full border border-gray-200 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-gray-800 bg-white focus:outline-none transition-colors"
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 mt-0.5 accent-[#F4B41A] cursor-pointer shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-xs font-bold text-gray-800">{label}</span>
          <span className="block text-xs text-gray-500 mt-1">{hint}</span>
        </span>
      </label>
    </div>
  );
}

export default function SettingsPage() {
  // Only what has been TYPED lives in state; the saved record stays in the
  // cache. Copying the fetched record into state needed an effect to seed it,
  // and that effect either clobbered half-typed edits on every background
  // refresh or had to be guarded into never running twice.
  const [profileEdits, setProfileEdits] = useState<Partial<CompanyProfile>>({});
  // Percentages here, fractions on the wire: the server stores 0.15 for 15%.
  const [tillEdits, setTillEdits] = useState<Partial<TillSettings>>({});
  /**
   * Which group of settings is on screen.
   *
   * ONE form across all three: the tabs hide fields, they do not scope the
   * save. A cashier's VAT rate and the company address are saved together as
   * they always were, so switching tabs mid-edit cannot lose what was typed —
   * and a per-tab Save would have made "did that save?" a question with three
   * different answers.
   */
  const [tab, setTab] = useState<TabKey>("company");
  /**
   * The stock types — what a shop counts its goods in.
   *
   * Only fetched once the tab is opened: every other tab would pay for a list
   * it does not show.
   */
  const unitsQuery = useQuery(queryKey("units"), () => UnitsService.list(), {
    enabled: tab === "units",
  });
  const units = unitsQuery.data ?? [];
  const [unitDraft, setUnitDraft] = useState<(Omit<UnitOption, "id"> & { id?: string }) | null>(
    null
  );
  const [unitBusy, setUnitBusy] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);


  /**
   * Coupon codes.
   *
   * Here rather than on the Discount screen, and that is the distinction: the
   * Discount screen prices PRODUCTS — what a thing sells for this week — while
   * a coupon is a code the shop hands out on a leaflet and honours against the
   * whole bill. The till never decides what one is worth; it asks the server,
   * and the server prices the sale from the row below whatever the till says.
   */
  const couponsQuery = useQuery(queryKey("coupons"), () => CouponService.list(), {
    enabled: tab === "coupons",
  });
  const coupons = couponsQuery.data ?? [];
  const [couponDraft, setCouponDraft] = useState<
    (Omit<CouponInput, "value"> & { id?: string; value: string }) | null
  >(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const saveCoupon = async () => {
    if (!couponDraft) return;
    const value = Number(couponDraft.value);
    if (!couponDraft.code.trim()) {
      setCouponError("A coupon needs a code — the thing a customer types at the till.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setCouponError("A coupon has to take something off. Use a number above zero.");
      return;
    }
    setCouponBusy(true);
    setCouponError(null);
    try {
      const input = {
        code: couponDraft.code,
        mode: couponDraft.mode,
        value,
        isActive: couponDraft.isActive ?? true,
        description: couponDraft.description ?? "",
      };
      if (couponDraft.id) await CouponService.update(couponDraft.id, input);
      else await CouponService.create(input);
      setCouponDraft(null);
      invalidate("coupons");
    } catch (error) {
      setCouponError(
        error instanceof Error && error.message ? error.message : "That coupon could not be saved."
      );
    } finally {
      setCouponBusy(false);
    }
  };

  const toggleCoupon = async (id: string, isActive: boolean) => {
    setCouponBusy(true);
    setCouponError(null);
    try {
      await CouponService.update(id, { isActive });
      invalidate("coupons");
    } catch (error) {
      setCouponError(
        error instanceof Error && error.message ? error.message : "That could not be changed."
      );
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = async (id: string) => {
    setCouponBusy(true);
    setCouponError(null);
    try {
      await CouponService.remove(id);
      invalidate("coupons");
    } catch (error) {
      setCouponError(
        error instanceof Error && error.message ? error.message : "That coupon could not be removed."
      );
    } finally {
      setCouponBusy(false);
    }
  };

  const saveUnit = async () => {
    if (!unitDraft) return;
    if (!unitDraft.name.trim() || !unitDraft.shortName.trim()) {
      setUnitError("A stock type needs a name and a short name.");
      return;
    }
    setUnitBusy(true);
    setUnitError(null);
    try {
      const body = {
        name: unitDraft.name,
        shortName: unitDraft.shortName,
        allowDecimal: unitDraft.allowDecimal,
      };
      if (unitDraft.id) await UnitsService.update(unitDraft.id, body);
      else await UnitsService.create(body);
      setUnitDraft(null);
      void unitsQuery.refetch();
    } catch (err) {
      // The server's own sentence: a duplicate name and a permission refusal
      // are different problems and "could not save" tells a shopkeeper neither.
      setUnitError(err instanceof Error && err.message ? err.message : "That could not be saved.");
    } finally {
      setUnitBusy(false);
    }
  };
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

  /**
   * Which stock type is the shop's ACTIVE one.
   *
   * Saved the moment it is picked rather than waiting for Save Changes at the
   * foot of the form: the rest of this tab already works that way — adding,
   * renaming and deleting a stock type all write immediately — and one control
   * in the middle of them that needs a second, distant button would be the
   * only thing on the tab that silently did nothing.
   *
   * `activeUnitId` is the saved value; `activeBusy` holds the id being written
   * so only that row shows as pending.
   */
  const activeUnitId = String(valuesQuery.data?.[ACTIVE_STOCK_TYPE_KEY] ?? "");
  const [activeBusy, setActiveBusy] = useState<string | null>(null);

  /**
   * Make one stock type the active one, or clear it.
   *
   * Exactly one at a time by construction: this writes a single id, so picking
   * a second replaces the first rather than adding to it. Passing the id that
   * is already active clears it — a shop that stops having a usual unit needs
   * a way back to no default, and a set of radio buttons with no "none" is a
   * one-way door.
   */
  const setActiveUnit = async (unitId: string) => {
    if (activeBusy) return;
    const next = unitId === activeUnitId ? "" : unitId;
    setActiveBusy(unitId);
    setUnitError(null);
    try {
      await SettingsService.setValue(ACTIVE_STOCK_TYPE_KEY, next, "STRING");
      // Every screen that pre-fills a unit reads this, and the Add Product
      // form is usually already open in another tab.
      invalidate("settings");
    } catch (err) {
      setUnitError(
        err instanceof Error && err.message ? err.message : "That could not be saved."
      );
    } finally {
      setActiveBusy(null);
    }
  };

  /**
   * Add one of the ready-made stock types.
   *
   * The flag comes from the preset rather than from the shopkeeper reading a
   * sentence and ticking a box: "half units allowed" is right for a kilogram
   * and wrong for a piece, and getting it backwards is invisible until the
   * till refuses 2.5 metres of cloth.
   */
  const addPreset = async (preset: StockTypePreset) => {
    if (unitBusy) return;
    setUnitBusy(true);
    setUnitError(null);
    try {
      await UnitsService.create({
        name: preset.name,
        shortName: preset.shortName,
        allowDecimal: preset.allowDecimal,
      });
      void unitsQuery.refetch();
    } catch (err) {
      setUnitError(
        err instanceof Error && err.message ? err.message : "That could not be added."
      );
    } finally {
      setUnitBusy(false);
    }
  };

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
    /**
     * A number as a person writes one.
     *
     * The API stores a DECIMAL as "100.0000", and a box reading that invites
     * somebody to "fix" it to 100 and wonder what they just changed. Falls
     * back to the shop's starting value rather than to empty: an unset rule is
     * not "no rule", it is the default the server is already applying.
     */
    const plain = (raw: string, fallback: string) => {
      const n = Number(raw);
      return raw !== undefined && raw !== "" && Number.isFinite(n) ? String(+n) : fallback;
    };
    return {
      vat: pct(v["tax.default_rate"]),
      vatIncluded: String(v["tax.inclusive_by_default"] ?? "true") !== "false",
      maxDiscount: pct(v["pos.max_discount_percent"]),
      onlineMethods: parseOnlineMethods(v["pos.online_payment_methods"]),
      // Both default OFF, which is what the till did before either existed.
      allowPartial: String(v["pos.allow_partial_payment"] ?? "false") === "true",
      surchargeTaxable: String(v["pos.surcharge_taxable"] ?? "false") === "true",
      manualQuantity: String(v["pos.allow_manual_quantity"] ?? "false") === "true",
      // Off by default: every sale before this setting kept its paisa.
      roundToWhole: String(v["pos.round_to_whole"] ?? "false") === "true",
      // A whole number as a person writes one: the API stores "100.0000" and
      // a box reading that invites somebody to "fix" it to 100 and wonder
      // what they changed.
      loyaltyEnabled: String(v["loyalty.enabled"] ?? "false") === "true",
      earnPerAmount: plain(v["loyalty.earn_per_amount"], "100"),
      earnPoints: plain(v["loyalty.earn_points"], "10"),
      earnBasis: (["NET_PAYABLE", "DISCOUNTED", "SUBTOTAL"].includes(
        String(v["loyalty.earn_basis"] ?? "")
      )
        ? String(v["loyalty.earn_basis"])
        : "NET_PAYABLE") as TillSettings["earnBasis"],
      redeemMode: (String(v["loyalty.redeem_mode"] ?? "") === "PERCENT"
        ? "PERCENT"
        : "FLAT") as TillSettings["redeemMode"],
      redeemPoints: plain(v["loyalty.redeem_points"], "100"),
      redeemValue: plain(v["loyalty.redeem_value"], "50"),
      redeemPercent: plain(v["loyalty.redeem_percent"], "1"),
      minRedeemPoints: plain(v["loyalty.min_redeem_points"], "100"),
      allowPartialRedeem: String(v["loyalty.allow_partial_redeem"] ?? "false") === "true",
      maxRedeemPerSale: plain(v["loyalty.max_redeem_per_sale"], "0"),
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
      /**
       * A points rule as typed, floored at zero.
       *
       * An emptied box falls back to the shop's starting value rather than
       * saving 0 — "every ৳0 = 1 point" is a division by zero the server then
       * has to defend itself against, and nobody meant it.
       */
      const whole = (value: string, fallback: string) => {
        const n = Math.max(0, Number(value) || 0);
        return n > 0 ? String(n) : fallback;
      };
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
        SettingsService.setValue(
          "pos.allow_partial_payment",
          till.allowPartial ? "true" : "false",
          "BOOL"
        ),
        SettingsService.setValue(
          "pos.surcharge_taxable",
          till.surchargeTaxable ? "true" : "false",
          "BOOL"
        ),
        SettingsService.setValue(
          "pos.allow_manual_quantity",
          till.manualQuantity ? "true" : "false",
          "BOOL"
        ),
        SettingsService.setValue(
          "pos.round_to_whole",
          till.roundToWhole ? "true" : "false",
          "BOOL"
        ),
        // ── Customer points ──────────────────────────────────────────
        // Every rule the till follows. Saved as whole values rather than
        // fractions: "1 point per ৳100" is two numbers a shopkeeper typed,
        // not a rate to be derived and rounded.
        SettingsService.setValue("loyalty.enabled", till.loyaltyEnabled ? "true" : "false", "BOOL"),
        SettingsService.setValue("loyalty.earn_per_amount", whole(till.earnPerAmount, "100"), "DECIMAL"),
        SettingsService.setValue("loyalty.earn_points", whole(till.earnPoints, "10"), "INT"),
        SettingsService.setValue("loyalty.earn_basis", till.earnBasis, "STRING"),
        SettingsService.setValue("loyalty.redeem_mode", till.redeemMode, "STRING"),
        SettingsService.setValue("loyalty.redeem_points", whole(till.redeemPoints, "100"), "INT"),
        SettingsService.setValue("loyalty.redeem_value", whole(till.redeemValue, "50"), "DECIMAL"),
        SettingsService.setValue("loyalty.redeem_percent", whole(till.redeemPercent, "1"), "DECIMAL"),
        SettingsService.setValue(
          "loyalty.min_redeem_points",
          whole(till.minRedeemPoints, "0"),
          "INT"
        ),
        SettingsService.setValue(
          "loyalty.allow_partial_redeem",
          till.allowPartialRedeem ? "true" : "false",
          "BOOL"
        ),
        // 0 is "no ceiling", which is what an empty box means here.
        SettingsService.setValue(
          "loyalty.max_redeem_per_sale",
          whole(till.maxRedeemPerSale, "0"),
          "INT"
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
      {/* The tabs. A row of real buttons rather than links: the three share one
          form and one Save, so moving between them must not leave the page. */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex w-full gap-1 overflow-x-auto rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`shrink-0 cursor-pointer rounded-lg px-4 py-2 text-xs font-bold transition-colors sm:text-sm ${
                active
                  ? "bg-[#F4B41A] text-white shadow-xs"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Main Settings Container */}
      <form onSubmit={handleSave} className="flex flex-col lg:flex-row items-start gap-6">
        {/* Left Branding / Logo Card — Company only; on the other two tabs it
            is a picture of a logo beside fields that have nothing to do with
            it, and it pushes them into half the width for nothing. */}
        {tab === "company" && (
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
        )}

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
          {/* ---- Company ---------------------------------------------- */}
          {tab === "company" && (
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

            </>
          )}

          {/* ---- Till & tax ------------------------------------------- */}
          {tab === "till" && (
            <>
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-500">
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

          <Toggle
            checked={till.manualQuantity}
            onChange={(next) => setTillEdits((t) => ({ ...t, manualQuantity: next }))}
            label="Let cashiers type a quantity at the till"
            hint="Off: the quantity only moves with the + and - buttons, which cannot turn 10 into 100 by accident. On: it can be typed, which is the only sensible way to sell 2.75 metres. Either way the stock type below decides whether a fraction is allowed at all."
          />

          <Toggle
            checked={till.vatIncluded}
            onChange={(next) => setTillEdits((t) => ({ ...t, vatIncluded: next }))}
            label="Shelf prices already include VAT"
            hint="On: the price on the label is what the customer pays, and the VAT is taken out of it. Off: VAT is added at the till."
          />
            </>
          )}

          {/* ---- Payments --------------------------------------------- */}
          {tab === "payments" && (
            <>
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



          <Toggle
            checked={till.allowPartial}
            onChange={(next) => setTillEdits((t) => ({ ...t, allowPartial: next }))}
            label="Allow partial payment in POS page"
            hint="On: a cashier can take less than the bill and the rest goes on the customer's account. Needs a named customer with a credit limit — a walk-in cannot carry a debt. Off: the payment dialog pays the full amount, which is what the till did before."
          />

          <Toggle
            checked={till.roundToWhole}
            onChange={(next) => setTillEdits((t) => ({ ...t, roundToWhole: next }))}
            label="Round the payable to a whole taka"
            hint="On: the amount the customer pays has no paisa. A fraction of .40 or more rounds up, anything less rounds down — ৳100.39 is ৳100, ৳100.40 is ৳101. The difference shows on its own line in the order summary and on the receipt, and a refund gives back what was actually paid. Off: amounts keep their paisa."
          />

          <Toggle
            checked={till.surchargeTaxable}
            onChange={(next) => setTillEdits((t) => ({ ...t, surchargeTaxable: next }))}
            label="Charge VAT on additional payments"
            hint="An additional payment is a surcharge the cashier adds — a late-hour fee, a delivery run. Off: it is added after tax and carries none. On: it is treated like a shelf price, so the figure typed already includes its VAT."
          />
            </>
          )}

          {/* ---- Customer points ------------------------------------ */}
          {tab === "loyalty" && (
            <>
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500">
                  Every rule the till follows lives here. Nothing about points is decided
                  in the POS — switch this off and the payment screen has no points on it
                  at all.
                </p>
              </div>

              <Toggle
                checked={till.loyaltyEnabled}
                onChange={(next) => setTillEdits((t) => ({ ...t, loyaltyEnabled: next }))}
                label="Run a customer points scheme"
                hint="Off: nothing is awarded, nothing is shown at the till, and no points history is kept. On: the rules below apply to every sale with a customer on it."
              />

              {/* The rest only once the scheme is on. A page of rules for a
                  scheme nobody runs is a page of questions nobody asked. */}
              {till.loyaltyEnabled && (
                <>
                  <div className="sm:col-span-2 mt-2 border-t border-gray-100 pt-4">
                    <p className="text-xs font-bold text-gray-800">Earning</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Spend {till.earnPerAmount || "…"} taka, earn {till.earnPoints || "…"}{" "}
                      point{till.earnPoints === "1" ? "" : "s"}. Rounded down — ৳99 earns
                      nothing on a ৳100 rule.
                    </p>
                  </div>

                  <NumberBox
                    id="loy-per"
                    label="Every this many taka spent"
                    value={till.earnPerAmount}
                    onChange={(v) => setTillEdits((t) => ({ ...t, earnPerAmount: v }))}
                  />
                  <NumberBox
                    id="loy-pts"
                    label="…earns this many points"
                    value={till.earnPoints}
                    onChange={(v) => setTillEdits((t) => ({ ...t, earnPoints: v }))}
                  />

                  {/* WHICH figure counts as spending. Asked out loud because
                      all three are defensible and they disagree — leaving it
                      implicit is how a shop finds out at the counter. */}
                  <div className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-bold text-gray-800">
                      Points are earned on
                    </span>
                    <div className="flex flex-col gap-2">
                      {(
                        [
                          [
                            "NET_PAYABLE",
                            "What the customer actually paid",
                            "After discounts and after any points they just spent. A shop pays out loyalty on money it received.",
                          ],
                          [
                            "DISCOUNTED",
                            "The bill after discounts",
                            "Before points are redeemed, so spending points does not also cost the points they would have earned.",
                          ],
                          [
                            "SUBTOTAL",
                            "The bill before discounts",
                            "The most generous. Keeps an offer from feeling like a penalty.",
                          ],
                        ] as const
                      ).map(([value, label, hint]) => (
                        <label
                          key={value}
                          className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors ${
                            till.earnBasis === value
                              ? "border-amber-300 bg-amber-50/40"
                              : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="loyalty-basis"
                            checked={till.earnBasis === value}
                            onChange={() => setTillEdits((t) => ({ ...t, earnBasis: value }))}
                            className="mt-0.5 size-4 shrink-0 accent-[#F4B41A]"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-gray-800">{label}</span>
                            <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="sm:col-span-2 mt-2 border-t border-gray-100 pt-4">
                    <p className="text-xs font-bold text-gray-800">Redeeming</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {till.redeemMode === "PERCENT" ? (
                        <>
                          {till.redeemPoints || "…"} points is {till.redeemPercent || "…"}% off.
                          Points are spent in whole blocks, so with {till.redeemPoints || "100"}{" "}
                          per block a customer holding 380 spends 300 for 3% and keeps 80.
                        </>
                      ) : (
                        <>
                          {till.redeemPoints || "…"} points is {till.redeemValue || "…"} taka
                          off, whatever the bill.
                        </>
                      )}{" "}
                      Points can take a sale to zero, never below it.
                    </p>
                  </div>

                  {/* FLAT or PERCENT. Asked as two cards rather than a
                      dropdown because they are different schemes, not two
                      values of one — a percentage is worth more on a bigger
                      basket and a flat amount is not. */}
                  <div className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(
                      [
                        [
                          "FLAT",
                          "A fixed amount",
                          "100 points takes ৳50 off any bill. The same every time and the easiest to explain.",
                        ],
                        [
                          "PERCENT",
                          "A percentage of the bill",
                          "100 points takes 1% off. Worth more on a bigger basket, which is the reason to pick it.",
                        ],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors ${
                          till.redeemMode === value
                            ? "border-amber-300 bg-amber-50/40"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="loyalty-redeem-mode"
                          checked={till.redeemMode === value}
                          onChange={() => setTillEdits((t) => ({ ...t, redeemMode: value }))}
                          className="mt-0.5 size-4 shrink-0 accent-[#F4B41A]"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-gray-800">{label}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <NumberBox
                    id="loy-rpts"
                    label="This many points"
                    value={till.redeemPoints}
                    onChange={(v) => setTillEdits((t) => ({ ...t, redeemPoints: v }))}
                  />
                  {till.redeemMode === "PERCENT" ? (
                    <NumberBox
                      id="loy-rpct"
                      label="…takes this percent off"
                      value={till.redeemPercent}
                      onChange={(v) => setTillEdits((t) => ({ ...t, redeemPercent: v }))}
                    />
                  ) : (
                    <NumberBox
                      id="loy-rval"
                      label="…is worth this many taka"
                      value={till.redeemValue}
                      onChange={(v) => setTillEdits((t) => ({ ...t, redeemValue: v }))}
                    />
                  )}
                  <NumberBox
                    id="loy-min"
                    label="Minimum points before any can be spent"
                    value={till.minRedeemPoints}
                    onChange={(v) => setTillEdits((t) => ({ ...t, minRedeemPoints: v }))}
                  />
                  <NumberBox
                    id="loy-max"
                    label="Most points per sale (0 = no limit)"
                    value={till.maxRedeemPerSale}
                    onChange={(v) => setTillEdits((t) => ({ ...t, maxRedeemPerSale: v }))}
                  />

                  <Toggle
                    checked={till.allowPartialRedeem}
                    onChange={(next) =>
                      setTillEdits((t) => ({ ...t, allowPartialRedeem: next }))
                    }
                    label="Allow part of a block to be spent"
                    hint={`Off: points are spent in whole blocks of ${till.redeemPoints || "…"}, which is easier to explain across a counter. On: any amount above the minimum, priced per point.`}
                  />
                </>
              )}
            </>
          )}

          {/* ---- Stock types --------------------------------------- */}
          {tab === "units" && (
            <>
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-500">
              What your goods are counted in. A bottle is sold whole; cloth is sold by
              the metre. Ticking &quot;half units allowed&quot; is what lets the till take
              2.5 of something — everything else is refused as a whole number.
            </p>
            <p className="mt-1.5 text-xs text-gray-500">
              Mark one as <span className="font-bold text-gray-800">Active</span> and new
              products start in it, so a shop that only weighs things never answers the
              question again. Products already on your list keep the type they have.
            </p>
          </div>

          {/* Ready-made types.
              Typing each one in by hand meant deciding "half units allowed" from
              a sentence, and getting it backwards is invisible until the till
              refuses 2.5 metres of cloth. One press each, with the flag already
              right. Anything not here is still added in the form below. */}
          <div className="sm:col-span-2 flex flex-col gap-[8px]">
            <p className="text-xs font-bold text-gray-800">Add a ready-made type</p>
            <div className="flex flex-wrap gap-[8px]">
              {STOCK_TYPE_PRESETS.map((preset) => {
                const added = presetAlreadyAdded(preset, units);
                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={added || unitBusy}
                    onClick={() => addPreset(preset)}
                    title={
                      added
                        ? `${preset.name} is already on your list`
                        : `${preset.note} · ${preset.allowDecimal ? "half units allowed" : "whole numbers only"}`
                    }
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      added
                        ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                        : "border-gray-200 text-gray-700 hover:border-amber-400 hover:bg-amber-50/40"
                    }`}
                  >
                    {added ? "✓ " : "+ "}
                    {preset.name}
                    <span className={added ? "text-gray-300" : "text-gray-400"}>
                      {" "}
                      ({preset.shortName})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2 flex flex-col gap-[8px]">
            {unitsQuery.loading && <p className="text-xs text-gray-500">Loading…</p>}
            {!unitsQuery.loading && units.length === 0 && (
              <p className="text-xs text-gray-500">No stock types yet.</p>
            )}
            {units.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-[10px] rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-[8px] text-xs font-bold text-gray-800">
                    {u.name} <span className="text-gray-400">({u.shortName})</span>
                    {u.id === activeUnitId && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 uppercase">
                        Active
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {u.allowDecimal ? "Half units allowed" : "Whole numbers only"}
                    {u.id === activeUnitId ? " · new products start in this" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-[8px]">
                  {/* One at a time by construction: this writes a single id, so
                      choosing a second replaces the first. Pressing the active
                      one clears it — a shop that stops having a usual type
                      needs a way back to no default. */}
                  <button
                    type="button"
                    disabled={activeBusy !== null}
                    aria-pressed={u.id === activeUnitId}
                    onClick={() => setActiveUnit(u.id)}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      u.id === activeUnitId
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {activeBusy === u.id
                      ? "Saving…"
                      : u.id === activeUnitId
                        ? "Active"
                        : "Make active"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitDraft({ ...u })}
                    className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setUnitError(null);
                      try {
                        await UnitsService.remove(u.id);
                        void unitsQuery.refetch();
                      } catch (err) {
                        setUnitError(
                          err instanceof Error && err.message
                            ? err.message
                            : "That stock type is in use."
                        );
                      }
                    }}
                    className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {unitDraft ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-800">Name</span>
                    <input
                      value={unitDraft.name}
                      onChange={(e) => setUnitDraft({ ...unitDraft, name: e.target.value })}
                      placeholder="Metre"
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-800 focus:border-amber-400 focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-800">Short name</span>
                    <input
                      value={unitDraft.shortName}
                      onChange={(e) => setUnitDraft({ ...unitDraft, shortName: e.target.value })}
                      placeholder="m"
                      maxLength={10}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-800 focus:border-amber-400 focus:outline-none"
                    />
                  </label>
                </div>
                <label className="mt-3 flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={unitDraft.allowDecimal}
                    onChange={(e) =>
                      setUnitDraft({ ...unitDraft, allowDecimal: e.target.checked })
                    }
                    className="size-4 accent-[#F4B41A] cursor-pointer"
                  />
                  <span className="text-xs font-bold text-gray-800">
                    Half units allowed (2.5 is valid)
                  </span>
                </label>
                <div className="mt-3 flex items-center gap-[8px]">
                  <button
                    type="button"
                    disabled={unitBusy}
                    onClick={saveUnit}
                    className="cursor-pointer rounded-xl bg-[#F4B41A] px-5 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {unitBusy ? "Saving…" : "Save stock type"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUnitDraft(null);
                      setUnitError(null);
                    }}
                    className="cursor-pointer rounded-xl border border-gray-200 px-5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setUnitDraft({ name: "", shortName: "", allowDecimal: false })
                }
                className="w-fit cursor-pointer rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                + Add a stock type
              </button>
            )}

            {unitError && (
              <p role="alert" className="text-xs font-semibold text-red-700">
                {unitError}
              </p>
            )}
          </div>
            </>
          )}

          {/* ---- Coupons -------------------------------------------- */}
          {tab === "coupons" && (
            <>
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500">
                  Codes you print on a leaflet and honour at the till. A cashier types the
                  code, the till checks it here, and the discount comes off the whole bill.
                </p>
                <p className="mt-1.5 text-xs text-gray-500">
                  This is not the same as a product offer. An offer is what one thing
                  sells for this week and lives on the{" "}
                  <Link href="/discount" className="font-semibold text-amber-700 underline">
                    Discount
                  </Link>{" "}
                  screen; a coupon is money off the whole sale, and it is not held to the
                  discount limit a cashier is allowed to give away by hand.
                </p>
              </div>

              <div className="sm:col-span-2 flex flex-col gap-[8px]">
                {couponsQuery.loading && <p className="text-xs text-gray-500">Loading…</p>}
                {!couponsQuery.loading && coupons.length === 0 && (
                  <p className="text-xs text-gray-500">
                    No coupons yet. Add one below and it works at the till straight away.
                  </p>
                )}
                {coupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="flex flex-wrap items-center justify-between gap-[10px] rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-[8px] text-xs font-bold text-gray-800">
                        <span className="font-mono tracking-wide">{coupon.code}</span>
                        <span className="text-gray-400">
                          {coupon.mode === "PERCENT"
                            ? `${+coupon.value.toFixed(2)}% off`
                            : `৳${+coupon.value.toFixed(2)} off`}
                        </span>
                        {!coupon.isActive && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-gray-600 uppercase">
                            Off
                          </span>
                        )}
                      </p>
                      {coupon.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{coupon.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-[8px]">
                      {/* Switched off rather than deleted, for a code that has
                          run: a sale stamps the code it honoured, and a shop
                          looking back at last month's takings should still be
                          able to see what EID25 was. */}
                      <button
                        type="button"
                        disabled={couponBusy}
                        aria-pressed={coupon.isActive}
                        onClick={() => toggleCoupon(coupon.id, !coupon.isActive)}
                        className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          coupon.isActive
                            ? "border-amber-400 bg-amber-50 text-amber-800"
                            : "border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {coupon.isActive ? "On" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCouponDraft({
                            id: coupon.id,
                            code: coupon.code,
                            mode: coupon.mode,
                            value: String(coupon.value),
                            isActive: coupon.isActive,
                            description: coupon.description,
                          })
                        }
                        className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={couponBusy}
                        onClick={() => removeCoupon(coupon.id)}
                        className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                {couponDraft ? (
                  <div className="flex flex-col gap-[10px] rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-4">
                    <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                      <label className="flex flex-col gap-[4px]">
                        <span className="text-xs font-bold text-gray-800">Code</span>
                        <input
                          value={couponDraft.code}
                          onChange={(e) =>
                            setCouponDraft({ ...couponDraft, code: e.target.value.toUpperCase() })
                          }
                          placeholder="EID25"
                          aria-label="Coupon code"
                          className="h-[40px] rounded-xl border border-gray-200 bg-white px-3 font-mono text-xs tracking-wide text-gray-800 outline-none focus:border-amber-400"
                        />
                      </label>
                      <label className="flex flex-col gap-[4px]">
                        <span className="text-xs font-bold text-gray-800">Takes off</span>
                        <div className="flex items-center gap-[8px]">
                          <input
                            value={couponDraft.value}
                            onChange={(e) =>
                              setCouponDraft({
                                ...couponDraft,
                                value: e.target.value.replace(/[^\d.]/g, ""),
                              })
                            }
                            inputMode="decimal"
                            placeholder="10"
                            aria-label="Coupon amount"
                            className="h-[40px] min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-800 outline-none focus:border-amber-400"
                          />
                          {/* The same two a product offer uses, because shops
                              think in both: "10% off" and "৳50 off" are not the
                              same promise on a varying bill. */}
                          <span className="flex shrink-0 items-center gap-[2px] rounded-lg bg-white p-[2px] ring-1 ring-gray-200">
                            {(["PERCENT", "FLAT"] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setCouponDraft({ ...couponDraft, mode })}
                                aria-pressed={couponDraft.mode === mode}
                                aria-label={mode === "PERCENT" ? "Percentage off" : "Taka off"}
                                className={`h-[30px] w-[34px] cursor-pointer rounded-md text-xs font-bold transition-colors ${
                                  couponDraft.mode === mode
                                    ? "bg-[#F4B41A] text-white"
                                    : "text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                {mode === "PERCENT" ? "%" : "৳"}
                              </button>
                            ))}
                          </span>
                        </div>
                      </label>
                      <label className="flex flex-col gap-[4px] sm:col-span-2">
                        <span className="text-xs font-bold text-gray-800">
                          What it is for <span className="text-gray-400">(optional)</span>
                        </span>
                        <input
                          value={couponDraft.description ?? ""}
                          onChange={(e) =>
                            setCouponDraft({ ...couponDraft, description: e.target.value })
                          }
                          placeholder="Eid leaflet, April"
                          aria-label="Coupon description"
                          className="h-[40px] rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-800 outline-none focus:border-amber-400"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <button
                        type="button"
                        disabled={couponBusy}
                        onClick={saveCoupon}
                        className="cursor-pointer rounded-xl bg-[#F4B41A] px-5 py-2 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {couponBusy ? "Saving…" : "Save coupon"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCouponDraft(null);
                          setCouponError(null);
                        }}
                        className="cursor-pointer rounded-xl border border-gray-200 px-5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setCouponDraft({
                        code: "",
                        mode: "PERCENT",
                        value: "",
                        isActive: true,
                        description: "",
                      })
                    }
                    className="w-fit cursor-pointer rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    + Add a coupon
                  </button>
                )}

                {couponError && (
                  <p role="alert" className="text-xs font-semibold text-red-700">
                    {couponError}
                  </p>
                )}
              </div>
            </>
          )}

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
