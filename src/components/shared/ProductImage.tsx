"use client";

import React from "react";
import Image from "next/image";

/**
 * A product photograph, wherever one is shown.
 *
 * Product images are NOT run through the Next image optimizer, and that is
 * deliberate rather than a shortcut. The API hands back a presigned object URL:
 * the signature is part of the query string, it is regenerated on every read,
 * and it expires within the hour. A native image requests that URL exactly as
 * issued by the API, without Next's image loader rewriting or proxying it.
 *
 * Bundled assets under /public keep the optimizer, since they have none of
 * those problems. Only the remote, signed, expiring ones opt out.
 */
export default function ProductImage({
  src,
  alt = "",
  sizes,
  className = "object-cover",
  fallback = "/placeholder-product.svg",
}: {
  src?: string | null;
  alt?: string;
  sizes: string;
  className?: string;
  fallback?: string;
}) {
  const resolved = src || fallback;
  const remote = /^https?:\/\//i.test(resolved);

  if (remote) {
    return (
      <img
        src={resolved}
        alt={alt}
        className={`absolute inset-0 h-full w-full ${className}`}
        onError={(event) => {
          if (event.currentTarget.src === fallback) return;
          event.currentTarget.src = fallback;
        }}
      />
    );
  }

  return (
    <Image
      src={resolved}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
    />
  );
}
