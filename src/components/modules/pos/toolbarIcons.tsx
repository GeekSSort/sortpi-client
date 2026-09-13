import React from "react";

/**
 * The till toolbar's icons — Figma 6:890.
 *
 * Path data is the exported asset's, unaltered. Only the stroke is changed,
 * from the design's literal #666666 to `currentColor`, so a button can darken
 * its icon and its label together on hover; at rest the button's own #666
 * renders exactly what the export does.
 *
 * Inlined rather than loaded from public/: this is what every other icon in
 * the till already does (see ProductGrid's SearchIcon), and an <img> per
 * control is five requests for about a kilobyte of path data.
 */

/** Magnifier — node 6:893. 16x16. */
export function SearchIcon() {
  return (
    <svg className="block size-[16px] shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M14 14L11.1067 11.1067"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Barcode in a viewfinder — node 6:903.
 *
 * The export is 16.2998 square inside a 20px frame, which is the stroke's own
 * width spilling past the 15px artboard. Kept exactly: rounding it to 16
 * clips the corner brackets against the frame.
 */
export function ScanIcon() {
  return (
    <svg
      className="block size-[16.3px] shrink-0"
      viewBox="0 0 16.2998 16.2998"
      fill="none"
      aria-hidden
    >
      {[
        "M0.65 3.98333V2.31667C0.65 1.87464 0.825595 1.45072 1.13816 1.13816C1.45072 0.825595 1.87464 0.65 2.31667 0.65H3.98333",
        "M12.3165 0.65H13.9832C14.4252 0.65 14.8491 0.825595 15.1617 1.13816C15.4742 1.45072 15.6498 1.87464 15.6498 2.31667V3.98333",
        "M15.6498 12.3165V13.9832C15.6498 14.4252 15.4742 14.8491 15.1617 15.1617C14.8491 15.4742 14.4252 15.6498 13.9832 15.6498H12.3165",
        "M3.98333 15.6498H2.31667C1.87464 15.6498 1.45072 15.4742 1.13816 15.1617C0.825595 14.8491 0.65 14.4252 0.65 13.9832V12.3165",
        "M4.15 3.9835V12.3168",
        "M8.15 3.9835V12.3168",
        "M12.15 3.9835V12.3168",
      ].map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** Bell — node 6:921. 20x20. */
export function BellIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M8.55667 17.5C8.70295 17.7533 8.91335 17.9637 9.1667 18.11C9.42006 18.2563 9.70745 18.3333 10 18.3333C10.2925 18.3333 10.5799 18.2563 10.8333 18.11C11.0867 17.9637 11.297 17.7533 11.4433 17.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.3334 6.66699C18.3334 4.75033 17.6667 3.08366 16.6667 1.66699"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.71821 12.772C2.60935 12.8913 2.53751 13.0397 2.51143 13.1991C2.48534 13.3585 2.50615 13.522 2.5713 13.6698C2.63646 13.8176 2.74316 13.9433 2.87843 14.0316C3.01369 14.1198 3.1717 14.1669 3.33321 14.167H16.6665C16.828 14.167 16.9861 14.1202 17.1214 14.0321C17.2568 13.944 17.3636 13.8184 17.429 13.6708C17.4943 13.5231 17.5153 13.3596 17.4894 13.2001C17.4635 13.0407 17.3919 12.8923 17.2832 12.7728C16.1749 11.6303 14.9999 10.4162 14.9999 6.66699C14.9999 5.34091 14.4731 4.06914 13.5354 3.13146C12.5977 2.19378 11.326 1.66699 9.99988 1.66699C8.6738 1.66699 7.40203 2.19378 6.46435 3.13146C5.52666 4.06914 4.99988 5.34091 4.99988 6.66699C4.99988 10.4162 3.82405 11.6303 2.71821 12.772Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.33341 1.66699C2.33341 3.08366 1.66675 4.75033 1.66675 6.66699"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
