import React from "react";

/**
 * Draws a Figma SVG through a CSS mask, so the shape stays exact and the
 * colour follows `currentColor`. Figma bakes the fill into its exports, which
 * breaks any component that needs the same icon in two colours.
 */
export default function MaskIcon({
  src,
  className = "",
  inset = "0",
}: {
  src: string;
  className?: string;
  /** Glyph inset inside its frame, as given by Figma. */
  inset?: string;
}) {
  return (
    <span
      aria-hidden
      className={`absolute bg-current ${className}`}
      style={{
        inset,
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
      }}
    />
  );
}
