"use client";

import React, { useMemo } from "react";
import { encodeBarcode } from "@/lib/barcode";

/**
 * A barcode, drawn as vectors from its digits.
 *
 * SVG rather than an image, and rects rather than a raster, for one reason: a
 * shelf label is PRINTED. A 300dpi printer draws these bars at 300dpi from the
 * same markup a 96dpi screen draws them at 96, and a scanner reads a printed
 * label by measuring bar widths — so a barcode that is a scaled bitmap is a
 * barcode that stops scanning at the size somebody actually needs it.
 *
 * The bars come out of `lib/barcode.ts`, which encodes EAN-13 and Code 39 and is
 * checked against published module strings. Nothing here decides what the bars
 * mean; this only draws them.
 */
export default function Barcode({
  value,
  height = 48,
  moduleWidth = 2,
  showText = true,
  className = "",
}: {
  value: string;
  /** Bar height in px. The quiet zone and text are added around it. */
  height?: number;
  /** Width of one module. Below 1.5 a laser scanner starts to struggle in print. */
  moduleWidth?: number;
  showText?: boolean;
  className?: string;
}) {
  const encoded = useMemo(() => encodeBarcode(value), [value]);

  if (!encoded) {
    return (
      <span className={`text-[12px] text-[#a3a3a3] ${className}`}>No barcode</span>
    );
  }

  // The white margin either side. A scanner needs it to find the start of the
  // symbol at all — a barcode printed hard against a border is a barcode that
  // reads intermittently, which is worse than one that never reads.
  const quiet = moduleWidth * 10;
  const textHeight = showText ? 14 : 0;
  const width = encoded.modules.length * moduleWidth + quiet * 2;
  const totalHeight = height + textHeight + 4;

  // Runs of "1" become one rect each, rather than one per module: a 95-module
  // EAN-13 is about 30 rects this way and 95 the other, and a product list
  // draws hundreds of these at once.
  const bars: { x: number; width: number }[] = [];
  let run = 0;
  for (let i = 0; i <= encoded.modules.length; i += 1) {
    if (encoded.modules[i] === "1") {
      run += 1;
      continue;
    }
    if (run > 0) {
      bars.push({ x: quiet + (i - run) * moduleWidth, width: run * moduleWidth });
      run = 0;
    }
  }

  return (
    <svg
      className={`block ${className}`}
      width={width}
      height={totalHeight}
      viewBox={`0 0 ${width} ${totalHeight}`}
      role="img"
      aria-label={`Barcode ${encoded.text}`}
      shapeRendering="crispEdges"
    >
      {/* Painted white rather than left transparent: printed onto a coloured
          card, a transparent quiet zone is not a quiet zone. */}
      <rect x="0" y="0" width={width} height={totalHeight} fill="#ffffff" />
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y={0} width={bar.width} height={height} fill="#000000" />
      ))}
      {showText && (
        <text
          x={width / 2}
          y={height + textHeight}
          textAnchor="middle"
          fontFamily="ui-monospace, 'SFMono-Regular', Menlo, monospace"
          fontSize={textHeight}
          letterSpacing={moduleWidth}
          fill="#000000"
        >
          {encoded.text}
        </text>
      )}
    </svg>
  );
}
