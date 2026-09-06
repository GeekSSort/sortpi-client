import { CompanyProfile } from "@/types/settings";

/**
 * The organization -> the company profile form.
 *
 * `/organizations/` returns a list of one, and its fields are named for the
 * organization, not for this form. Read straight, every input got `undefined`,
 * which is what turned them from controlled into uncontrolled.
 *
 * Business type, website and trade licence have nowhere to be stored on the
 * server. They stay on the form because the design asks for them, and they are
 * listed in the backend report.
 */

export function toCompanyProfile(row: any, fallback: CompanyProfile): CompanyProfile {
  const org = Array.isArray(row) ? row[0] : row?.data?.[0] || row;
  if (!org) return fallback;

  const code = String(org.currencyCode || org.currency_code || "");
  const symbol = String(org.currencySymbol || org.currency_symbol || "");
  return {
    companyName: String(org.name || fallback.companyName),
    businessType: String(org.legalName || org.legal_name || ""),
    companyEmail: String(org.email || ""),
    phoneNumber: String(org.phone || ""),
    address: String(org.address || ""),
    website: String(org.website || ""),
    taxId: String(org.taxNumber || org.tax_number || ""),
    tradeLicenseBin: String(org.tradeLicense || org.trade_license || ""),
    currency: code ? `${code}${symbol ? ` — ${symbol}` : ""}` : fallback.currency,
    logoUrl: String(org.logoUrl || org.logo_url || ""),
  };
}

/** The form -> the fields the organization endpoint accepts. */
export function toOrganizationPayload(profile: Partial<CompanyProfile>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (profile.companyName !== undefined) body.name = profile.companyName;
  if (profile.businessType !== undefined) body.legal_name = profile.businessType;
  if (profile.companyEmail !== undefined) body.email = profile.companyEmail;
  if (profile.phoneNumber !== undefined) body.phone = profile.phoneNumber;
  if (profile.address !== undefined) body.address = profile.address;
  if (profile.taxId !== undefined) body.tax_number = profile.taxId;
  if (profile.logoUrl !== undefined) body.logo_url = profile.logoUrl;
  return body;
}

export function organizationId(row: any): string {
  const org = Array.isArray(row) ? row[0] : row?.data?.[0] || row;
  return String(org?.id ?? "");
}
