/**
 * Money typed into a box, and the ceiling it may not pass.
 *
 * Every "record a payment" dialog in this app has a maximum — what the
 * customer owes, what is owed to the supplier, what is left on a purchase —
 * and none of them enforced it. A cashier could type 5,000 against a 500
 * balance, and what happened next differed per screen: the customer ledger
 * accepted it and turned the shop into the debtor, the purchase endpoint
 * refused it with an error after the fact.
 *
 * The rule is the same everywhere, so it lives here once: strip anything that
 * is not a number, and if the result is over the ceiling, REPLACE it with the
 * ceiling. Replacing rather than refusing is what makes it feel like a limit
 * rather than a broken keyboard — the box shows the largest thing that can be
 * typed and the person carries on.
 */

/**
 * Digits and at most one decimal point. What a money box may contain.
 *
 * Leading zeros are collapsed, and that is not cosmetic. `clampToMax` only
 * rewrites a value that is OVER the ceiling, and "0000" is zero — under every
 * ceiling — so it passed straight through and the box accepted zeros without
 * limit. What the person then saw was a filled-in amount field, a Record
 * payment button that stayed grey, and no explanation: the amount could not be
 * "stored" because as far as the arithmetic was concerned nothing had been
 * typed. "0100" had the same shape, reading as one hundred while looking like
 * something else.
 *
 * A single leading zero survives, because "0" on its own and "0.5" mid-typing
 * are both real states of a box somebody is still filling in.
 */
export function digitsOnly(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const trimmed = whole.replace(/^0+(?=\d)/, "");
  if (!rest.length) return trimmed;
  // Four places, because that is what `numeric(18,4)` holds. A fifth is
  // refused by the API with "Ensure that there are no more than 4 decimal
  // places" — a message about the database, arriving after Save, about a
  // keystroke the box accepted without comment.
  return `${trimmed}.${rest.join("").slice(0, 4)}`;
}

/**
 * `raw`, cleaned, and never more than `max`.
 *
 * `max <= 0` means there is no meaningful ceiling — a settled account, or a
 * figure that has not loaded — and the value passes through cleaned but
 * uncapped, because clamping to zero would empty the box on every keystroke.
 *
 * The trailing "." of a half-typed decimal survives: "12." is on its way to
 * "12.5", and rewriting it mid-keystroke moves the caret.
 */
export function clampToMax(raw: string, max: number): string {
  const cleaned = digitsOnly(raw);
  if (cleaned === "" || cleaned === "." || max <= 0) return cleaned;
  if (cleaned.endsWith(".")) {
    const whole = Number(cleaned.slice(0, -1));
    return Number.isFinite(whole) && whole > max ? trim(max) : cleaned;
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return cleaned;
  return value > max ? trim(max) : cleaned;
}

/**
 * Clamp what was typed AND correct the box itself.
 *
 * `clampToMax` alone is not enough for a controlled input, and this is why
 * zeros could still be typed without limit after leading zeros were collapsed:
 * typing "0" into a box already holding "0" makes the DOM value "00", which
 * sanitises back to "0" — the SAME state React already had. React skips the
 * re-render when state does not change, so nothing ever wrote "0" back over
 * the DOM's "00", and the zeros piled up on screen while the state behind them
 * stayed at "0". The button stayed grey and the amount "could not be stored".
 *
 * The same applies to any keystroke the sanitiser rejects outright — a letter,
 * a second decimal point — so every money box should go through here rather
 * than calling `clampToMax` on `e.target.value` itself.
 */
export function clampTypedAmount(
  target: { value: string },
  max: number
): string {
  const cleaned = clampToMax(target.value, max);
  if (target.value !== cleaned) target.value = cleaned;
  return cleaned;
}

/**
 * The ceiling as a person would type it: no trailing zeros, no "500.00".
 *
 * FOUR decimal places, not two. Money is `numeric(18,4)` on the server and an
 * invoice really can owe 4338.5950. Rounding the ceiling to paisa rounded it
 * UP, so capping a line at "what this invoice still owes" produced 4338.6000 —
 * five paisa MORE than the invoice owed — and the server refused the payment
 * with "MAIN-26-000126 has 4338.5950 outstanding, less than the 4338.6000
 * allocated to it". The dialog had put the person in a state it would not
 * accept, using its own maximum.
 *
 * `Math.round(max * 10_000) / 10_000` is exact for any figure the API can
 * send, since the API cannot send more than four places. It also strips the
 * binary noise a float multiplication leaves behind.
 */
function trim(max: number): string {
  return String(Math.round(max * 10_000) / 10_000);
}

/**
 * The payable, rounded to a whole taka under `pos.round_to_whole`.
 *
 * A fraction of .40 or more rounds UP, anything under .40 rounds DOWN:
 * ৳100.39 is ৳100, ৳100.40 is ৳101, ৳100.75 is ৳101. The SERVER applies the
 * identical rule (`round_to_whole` in `apps/sales/pricing.py`) and checks the
 * tender against its own result, so this is the till showing the figure it is
 * about to be charged — never a figure of its own.
 *
 * Worked in ten-thousandths, not in floats. `100.4` reached by arithmetic is
 * often 100.39999999999999, whose fraction is JUST under .40: rounded as a
 * float it goes down, the server's Decimal goes up, and the tender is refused
 * for being sixty paisa short of a bill the screen never showed.
 */
export function roundToWhole(amount: number): number {
  const units = Math.round(amount * 10_000);
  if (units <= 0) return units / 10_000;
  const whole = Math.floor(units / 10_000);
  return units - whole * 10_000 >= 4_000 ? whole + 1 : whole;
}
