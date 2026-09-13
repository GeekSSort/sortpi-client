import { CompanyProfile } from "@/types/settings";
import { toCompanyProfile, toOrganizationPayload, organizationId } from "./mappers/settings";
import { apiFetch, apiList, tokenStore } from "./apiClient";
import { onInvalidate } from "@/lib/query/store";

export class SettingsService {
  /**
   * Fetch company profile settings.
   *
   * `null` when the account has no organization on it. The form has to decide
   * what to show for that — it used to be handed a sample company instead, so
   * a shop with nothing saved read as one that was already set up.
   */
  static async getCompanyProfile(): Promise<CompanyProfile | null> {
    // A list of one, with organization field names. Mapped, so every input
    // gets a string and stays controlled.
    const rows = await apiFetch<any>("/organizations/", { method: "GET" });
    return toCompanyProfile(rows);
  }

  /**
   * Update company profile settings.
   *
   * With no organization to PATCH there is nowhere to save, and the old
   * version returned the typed-in values as though there were: the form
   * reported "Saved" over a request that was never made.
   */
  static async updateCompanyProfile(payload: Partial<CompanyProfile>): Promise<CompanyProfile> {
    const rows = await apiFetch<any>("/organizations/", { method: "GET" });
    const id = organizationId(rows);
    if (!id) {
      throw new Error("No organization is in context, so there is nothing to save to.");
    }

    const saved = await apiFetch<any>(`/organizations/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(toOrganizationPayload(payload)),
    });
    const profile = toCompanyProfile(saved);
    if (!profile) throw new Error("The server accepted the change but returned no organization.");
    return profile;
  }

  /**
   * Every configured value, already resolved branch &rarr; organization &rarr;
   * the system default.
   *
   * One call for the lot rather than one per key, and cached: the till reads
   * the VAT rate and the discount cap on every load.
   */
  static async getValues(): Promise<Record<string, string>> {
    // Keyed by branch. `/settings/resolved/` answers for the branch the caller
    // is standing in, so one shared entry served whichever branch was loaded
    // first — the VAT rate and the discount cap of the branch you left, on the
    // till of the branch you moved to. A page reload clears the module either
    // way; this makes it safe without depending on that.
    const key = tokenStore.branch() ?? "org";
    let cached = valueCache.get(key);
    if (!cached) {
      cached = apiFetch<any[]>("/settings/resolved/", { method: "GET" })
        .then((rows) => {
          const out: Record<string, string> = {};
          for (const row of rows || []) {
            if (row?.key != null) out[String(row.key)] = String(row.value ?? "");
          }
          return out;
        })
        .catch(() => {
          // A failure must not be cached: the next read should try again.
          valueCache.delete(key);
          return {} as Record<string, string>;
        });
      valueCache.set(key, cached);
    }
    return cached;
  }

  /**
   * Drop every branch's cached values.
   *
   * Called on a write, on sign-out, and on ANY invalidation of `settings` —
   * including one broadcast from another tab. See the registration at the foot
   * of this file: without it the memo below outlived the invalidation that was
   * supposed to clear it, and the till kept serving settings the back office
   * had already changed.
   */
  static clearValueCache(): void {
    valueCache.clear();
  }

  /**
   * Change one organization-wide value.
   *
   * A key is stored once per organization, so this updates the existing row
   * when there is one and writes the first otherwise. The key itself cannot be
   * changed after the fact, which is why the value is all that is PATCHed.
   */
  static async setValue(key: string, value: string, valueType = "DECIMAL"): Promise<void> {
    const rows = await apiList<any>(
      `/settings/?limit=200`,
      { method: "GET" },
      (r) => r
    );
    const existing = (rows.data || []).find(
      (r: any) => String(r?.key) === key && !r?.branch
    );

    if (existing?.id) {
      await apiFetch(`/settings/${existing.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      });
    } else {
      await apiFetch("/settings/", {
        method: "POST",
        body: JSON.stringify({ key, value, value_type: valueType }),
      });
    }
    // Every branch, not just this one: an organization-wide row is the
    // fallback for branches that have no override, so writing one changes what
    // they resolve to.
    valueCache.clear();
  }
}

/** Resolved values per branch id ("org" when standing in none). */
const valueCache = new Map<string, Promise<Record<string, string>>>();

/**
 * Clear the memo above whenever the settings cache is invalidated.
 *
 * `setValue` clears it directly, which covers the tab that made the write. It
 * does NOT cover the other tabs: a shop runs the back office beside the till,
 * and an invalidation crossing between them is a message, not a function call
 * — the till's copy of this module never heard about the save. Its queries
 * refetched and this memo handed them the values from before.
 *
 * Registered at module scope so it is wired by the time anything reads a
 * setting, and matched on the prefix rather than the exact key so
 * `invalidate("settings")`, a derived expansion of it, and the sign-out
 * wildcard all reach it.
 */
onInvalidate((prefixes) => {
  if (prefixes.some((p) => p === "*" || p === "settings" || p.startsWith("settings:"))) {
    SettingsService.clearValueCache();
  }
});
