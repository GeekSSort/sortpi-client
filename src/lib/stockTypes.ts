/**
 * The stock types a shop is offered ready-made, and the one it counts in.
 *
 * A "stock type" is a `Unit` — what goods are counted in, and whether half of
 * one can be sold. Shops had to type each one in by hand, which meant getting
 * `allowDecimal` right from a sentence of explanation: tick it for cloth,
 * leave it for bottles. Getting it wrong is not visible until the till refuses
 * 2.5 metres, or accepts 2.5 bottles.
 *
 * So the common ones are offered as one press each, with the flag already set
 * the way that unit works. They are a STARTING POINT, not a fixed list — a
 * shop can still add "Bosta" or "Hali" in the form below them, and can rename
 * or delete any of these afterwards.
 */
export interface StockTypePreset {
  name: string;
  shortName: string;
  /** Whether half of one can be sold. Weight and length yes; a bottle no. */
  allowDecimal: boolean;
  /** What it is for, in the chooser. */
  note: string;
}

export const STOCK_TYPE_PRESETS: readonly StockTypePreset[] = [
  // Counted, not measured — the one the app has always seeded.
  { name: "Piece", shortName: "pcs", allowDecimal: false, note: "Counted whole" },
  // Weight.
  { name: "Kilogram", shortName: "kg", allowDecimal: true, note: "Weighed" },
  { name: "Gram", shortName: "g", allowDecimal: true, note: "Weighed" },
  // Volume.
  { name: "Litre", shortName: "L", allowDecimal: true, note: "Poured" },
  { name: "Millilitre", shortName: "ml", allowDecimal: true, note: "Poured" },
  // Length.
  { name: "Metre", shortName: "m", allowDecimal: true, note: "Measured" },
  { name: "Centimetre", shortName: "cm", allowDecimal: true, note: "Measured" },
] as const;

/**
 * Is this preset already on the shop's list?
 *
 * Matched on NAME, case-insensitively and trimmed, because that is what the
 * server makes unique per organization — adding "kilogram" beside "Kilogram"
 * is refused there, and offering the button anyway would be offering a press
 * that fails.
 */
export function presetAlreadyAdded(
  preset: StockTypePreset,
  existing: { name: string }[]
): boolean {
  const wanted = preset.name.trim().toLowerCase();
  return existing.some((u) => u.name.trim().toLowerCase() === wanted);
}

/** The settings key holding the shop's active stock type. */
export const ACTIVE_STOCK_TYPE_KEY = "inventory.default_unit_id";
