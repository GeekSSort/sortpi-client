import React from "react";

/**
 * An icon in two boxes, the way Figma draws them: a fixed outer size with the
 * artwork inset by the exact percentages Figma gives, so the picture keeps its
 * shape instead of stretching. The fills use currentColor, so whoever uses the
 * icon picks the colour.
 */
export default function Glyph({
  w,
  h,
  inset,
  viewBox,
  children,
}: {
  w: number;
  h: number;
  inset: string;
  viewBox: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative block shrink-0" style={{ width: w, height: h }} aria-hidden>
      <span className="absolute block" style={{ inset }}>
        <svg
          className="block h-full w-full"
          viewBox={viewBox}
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {children}
        </svg>
      </span>
    </span>
  );
}
