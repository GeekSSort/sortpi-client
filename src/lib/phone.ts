/**
 * Country dialling codes, and what counts as a valid number in each.
 *
 * The phone box used to be one free-text field with "+8801700000000" as its
 * placeholder, which asks every person to know and type their own country
 * code correctly. Most did not: the field accepted "01700-000000",
 * "1700000000" and "+880 1700 000000" alike and sent all three, so the same
 * shop's number arrived in three shapes and none of them was reliably
 * dialable.
 *
 * Splitting the code out of the field settles it. The country is chosen, not
 * typed, so the prefix is always right; the box beside it holds the national
 * number only; and what gets sent is always E.164 — `+` and digits, nothing
 * else — which is the one format every SMS gateway and dialler agrees on.
 *
 * `min`/`max` are the length of the NATIONAL number, after the trunk zero is
 * dropped. They are deliberately a range rather than an exact count: several
 * of these countries have both nine- and ten-digit subscriber numbers in use,
 * and rejecting a real number is worse than accepting an unlikely one. This
 * catches the mistakes people actually make — a digit short, a digit extra,
 * the country code typed twice — and does not pretend to be a carrier lookup.
 */

export type Country = {
  iso: string;
  name: string;
  dial: string;
  min: number;
  max: number;
  example: string;
};

// Bangladesh first because it is the default market — `DEFAULT_CURRENCY` is
// BDT and `DEFAULT_TIMEZONE` is Asia/Dhaka — then the rest by name so the
// list is scannable.
export const COUNTRIES: Country[] = [
  { iso: "BD", name: "Bangladesh", dial: "880", min: 10, max: 10, example: "1700000000" },
  { iso: "AU", name: "Australia", dial: "61", min: 9, max: 9, example: "412345678" },
  { iso: "BH", name: "Bahrain", dial: "973", min: 8, max: 8, example: "36001234" },
  { iso: "BR", name: "Brazil", dial: "55", min: 10, max: 11, example: "11912345678" },
  { iso: "CA", name: "Canada", dial: "1", min: 10, max: 10, example: "4165551234" },
  { iso: "CN", name: "China", dial: "86", min: 11, max: 11, example: "13112345678" },
  { iso: "EG", name: "Egypt", dial: "20", min: 10, max: 10, example: "1001234567" },
  { iso: "FR", name: "France", dial: "33", min: 9, max: 9, example: "612345678" },
  { iso: "DE", name: "Germany", dial: "49", min: 10, max: 11, example: "15112345678" },
  { iso: "IN", name: "India", dial: "91", min: 10, max: 10, example: "9812345678" },
  { iso: "ID", name: "Indonesia", dial: "62", min: 9, max: 12, example: "81234567890" },
  { iso: "IT", name: "Italy", dial: "39", min: 9, max: 10, example: "3123456789" },
  { iso: "JP", name: "Japan", dial: "81", min: 10, max: 10, example: "9012345678" },
  { iso: "KE", name: "Kenya", dial: "254", min: 9, max: 9, example: "712345678" },
  { iso: "KW", name: "Kuwait", dial: "965", min: 8, max: 8, example: "50123456" },
  { iso: "MY", name: "Malaysia", dial: "60", min: 9, max: 10, example: "123456789" },
  { iso: "MX", name: "Mexico", dial: "52", min: 10, max: 10, example: "5512345678" },
  { iso: "NP", name: "Nepal", dial: "977", min: 10, max: 10, example: "9812345678" },
  { iso: "NL", name: "Netherlands", dial: "31", min: 9, max: 9, example: "612345678" },
  { iso: "NG", name: "Nigeria", dial: "234", min: 10, max: 10, example: "8021234567" },
  { iso: "OM", name: "Oman", dial: "968", min: 8, max: 8, example: "92123456" },
  { iso: "PK", name: "Pakistan", dial: "92", min: 10, max: 10, example: "3001234567" },
  { iso: "PH", name: "Philippines", dial: "63", min: 10, max: 10, example: "9171234567" },
  { iso: "QA", name: "Qatar", dial: "974", min: 8, max: 8, example: "33123456" },
  { iso: "SA", name: "Saudi Arabia", dial: "966", min: 9, max: 9, example: "501234567" },
  { iso: "SG", name: "Singapore", dial: "65", min: 8, max: 8, example: "81234567" },
  { iso: "ZA", name: "South Africa", dial: "27", min: 9, max: 9, example: "711234567" },
  { iso: "ES", name: "Spain", dial: "34", min: 9, max: 9, example: "612345678" },
  { iso: "LK", name: "Sri Lanka", dial: "94", min: 9, max: 9, example: "712345678" },
  { iso: "TH", name: "Thailand", dial: "66", min: 9, max: 9, example: "812345678" },
  { iso: "TR", name: "Turkey", dial: "90", min: 10, max: 10, example: "5321234567" },
  { iso: "AE", name: "United Arab Emirates", dial: "971", min: 9, max: 9, example: "501234567" },
  { iso: "GB", name: "United Kingdom", dial: "44", min: 9, max: 10, example: "7400123456" },
  { iso: "US", name: "United States", dial: "1", min: 10, max: 10, example: "2015551234" },
  { iso: "VN", name: "Vietnam", dial: "84", min: 9, max: 10, example: "912345678" },
];

export const DEFAULT_COUNTRY = "BD";

export function findCountry(iso: string): Country {
  return COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0];
}

/**
 * Reduce whatever was typed to the national number's digits.
 *
 * Two habits are worth absorbing rather than refusing, because both are how
 * people write their own number down and neither is ambiguous:
 *
 *   the trunk zero   `01700000000` is how a Bangladeshi number is written at
 *                    home, and the leading 0 is exactly what E.164 drops
 *   the country code `8801700000000` typed into a box that already says +880,
 *                    which would otherwise silently become +8808801700000000
 *
 * Everything else — spaces, dashes, brackets, a leading `+` — is punctuation
 * and simply goes.
 */
export function normalizeNational(raw: string, country: Country): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith(country.dial) && digits.length > country.max) {
    digits = digits.slice(country.dial.length);
  }
  digits = digits.replace(/^0+/, "");
  return digits;
}

export function isValidNational(raw: string, country: Country): boolean {
  const digits = normalizeNational(raw, country);
  return digits.length >= country.min && digits.length <= country.max;
}

/** `+<dial><national>` — the only shape this app sends anywhere. */
export function toE164(raw: string, country: Country): string {
  return `+${country.dial}${normalizeNational(raw, country)}`;
}

/**
 * Why a number was refused, in words a person can act on.
 *
 * Returns null when there is nothing to say — an empty box on an optional
 * field is not an error, and neither is a number that is simply not finished
 * being typed.
 */
export function phoneProblem(raw: string, country: Country): string | null {
  const digits = normalizeNational(raw, country);
  if (digits.length === 0) return null;
  if (digits.length < country.min) {
    const missing = country.min - digits.length;
    return `${missing} more digit${missing === 1 ? "" : "s"} needed.`;
  }
  if (digits.length > country.max) return "That is too long for this country.";
  return null;
}
