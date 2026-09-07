/**
 * Barcodes, drawn from the number rather than fetched as a picture.
 *
 * A barcode is a deterministic function of its digits, so an image of one is a
 * cache of an arithmetic result — and a shop that prints its own shelf labels
 * would otherwise need a server round trip, a stored PNG per product and a
 * cache to invalidate when a code changes. Encoded here, a label is drawn from
 * the row already on screen and prints at whatever resolution the printer has,
 * which is the whole reason to draw it as vectors.
 *
 * No dependency. `jsbarcode` and its kin are small, but a till has to work when
 * the internet does not, and every package added to a POS is a supply chain
 * that reaches a shop's money. The two symbologies below are the ones a retail
 * shop actually meets, and both are short enough to read and check.
 *
 * EAN-13 for the 13 digits printed on a manufactured packet. Code 39 for
 * anything else — an internal SKU, a hand-assigned code, the alphanumerics a
 * shop invents for its own goods. Code 39 rather than Code 128 for those: it is
 * less dense, and it is a table small enough that it can be read and verified
 * by eye, which for the one function whose wrong answer is a barcode that scans
 * as the wrong product is worth more than the density.
 */

/** Left-hand odd parity. */
const L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];

/** Left-hand even parity. */
const G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];

/** Right hand, the complement of L. */
const R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];

/**
 * Which of the left six digits use even parity.
 *
 * This is where the thirteenth digit lives: EAN-13 encodes only twelve symbols,
 * and the first is carried entirely by the parity pattern of the other six. A
 * scanner reads the pattern back to recover it.
 */
const PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

/**
 * Code 39, as element widths: nine elements per character, bar first,
 * alternating, of which exactly three are wide. `w` is a wide element and `n` a
 * narrow one — the ratio between them is what a scanner measures, which is why
 * this table is widths rather than modules.
 */
const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw",
  C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww",
  O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw",
  W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", $: "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

/** How many narrow elements a wide one is worth. 3 is the usual setting. */
const WIDE = 3;

export type Symbology = "ean13" | "code39";

export interface EncodedBarcode {
  /** One character per module: "1" is a bar, "0" is a space. */
  modules: string;
  symbology: Symbology;
  /** The code as it should be printed under the bars. */
  text: string;
}

/**
 * The thirteenth digit of an EAN-13, computed from the first twelve.
 *
 * Weights alternate 1 and 3 from the left, and the check digit is what takes
 * the weighted sum up to a multiple of ten. A code whose check digit is wrong
 * is refused by every scanner in the world, silently, so this is also what
 * makes a generated code a real one rather than thirteen digits that look like
 * one.
 */
export function ean13CheckDigit(first12: string): string {
  const digits = first12.replace(/\D/g, "").slice(0, 12);
  if (digits.length !== 12) throw new Error("An EAN-13 check digit needs twelve digits.");
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/** Whether a string is a well-formed EAN-13, check digit included. */
export function isValidEan13(code: string): boolean {
  const digits = code.trim();
  if (!/^\d{13}$/.test(digits)) return false;
  return ean13CheckDigit(digits.slice(0, 12)) === digits[12];
}

function encodeEan13(code: string): string {
  const digits = code.trim();
  const parity = PARITY[Number(digits[0])];
  let modules = "101"; // start guard
  for (let i = 1; i <= 6; i += 1) {
    const digit = Number(digits[i]);
    modules += parity[i - 1] === "L" ? L[digit] : G[digit];
  }
  modules += "01010"; // centre guard
  for (let i = 7; i <= 12; i += 1) {
    modules += R[Number(digits[i])];
  }
  return `${modules}101`; // end guard
}

function encodeCode39(value: string): string {
  // Code 39 is upper case only, and delimited by an asterisk at each end. A
  // lower-case code is upper-cased rather than refused: the shop typed the
  // right number and a scanner reads the label either way.
  const body = `*${value.toUpperCase()}*`;
  const parts: string[] = [];

  for (const char of body) {
    const widths = CODE39[char];
    if (!widths) {
      throw new Error(`Code 39 cannot carry "${char}".`);
    }
    let symbol = "";
    for (let i = 0; i < widths.length; i += 1) {
      // Elements alternate bar, space, bar… starting with a bar.
      const bit = i % 2 === 0 ? "1" : "0";
      symbol += bit.repeat(widths[i] === "w" ? WIDE : 1);
    }
    parts.push(symbol);
  }

  // One narrow space between characters, and none after the last.
  return parts.join("0");
}

/**
 * Draw whichever symbology the code is.
 *
 * Thirteen valid digits are an EAN-13 — the number on a manufactured packet,
 * and what 499 of this shop's 515 products carry. Everything else is Code 39.
 * Returns null rather than throwing for a code neither can carry, because a
 * product list renders hundreds of these and one unprintable code must not take
 * the page down with it.
 */
export function encodeBarcode(code: string): EncodedBarcode | null {
  const text = (code || "").trim();
  if (!text) return null;

  try {
    if (isValidEan13(text)) {
      return { modules: encodeEan13(text), symbology: "ean13", text };
    }
    return { modules: encodeCode39(text), symbology: "code39", text };
  } catch {
    return null;
  }
}

/**
 * An internal barcode for a product that came without one.
 *
 * Prefix 20-29 is reserved by GS1 for "restricted circulation within a
 * geographic region" — in practice, codes a shop assigns to its own goods. It
 * is the one range guaranteed never to collide with a manufacturer's real
 * barcode, which is the whole point: an invented code that happens to match a
 * packet of biscuits somewhere is a wrong price at somebody's till.
 *
 * `seed` fills the middle nine digits. A caller with a sequence should pass it;
 * otherwise it comes from the clock and the collision is caught by the
 * database's unique constraint rather than guessed at here.
 */
export function internalEan13(seed?: number): string {
  const body = String(seed ?? Date.now() % 1_000_000_000).padStart(9, "0").slice(-9);
  const first12 = `200${body}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}
