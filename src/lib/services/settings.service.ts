import { CompanyProfile } from "@/types/settings";

export const initialCompanyProfile: CompanyProfile = {
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
};

export class SettingsService {
  private static baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

  /**
   * Fetch company profile settings
   */
  static async getCompanyProfile(): Promise<CompanyProfile> {
    return Promise.resolve(initialCompanyProfile);
  }

  /**
   * Update company profile settings
   */
  static async updateCompanyProfile(payload: Partial<CompanyProfile>): Promise<CompanyProfile> {
    const updated = { ...initialCompanyProfile, ...payload };
    return Promise.resolve(updated);
  }
}
