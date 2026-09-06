"use client";

import React from "react";
import Image from "next/image";

/**
 * A product photograph, wherever one is shown.
 *
 * Product images are NOT run through the Next image optimizer, and that is
 * deliberate rather than a shortcut. The API hands back a presigned object URL:
 * the signature is part of the query string, it is regenerated on every read,
 * and it expires within the hour. Optimizing that means the optimizer's cache
 * key changes on every page load — so it never hits, and it re-downloads the
 * original each time — and a page held open past the expiry ends up asking the
 * optimizer for a URL the bucket has started refusing.
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

  return (
    <Image
      src={resolved}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      unoptimized={remote}
    />
  );
}
