import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Disables the on-disk image cache.
     *
     * Next 16 writes optimized images to `.next/cache/images` and evicts them
     * with an LRU keyed by size on disk. Some entries measure 0, and an entry
     * that measures 0 could never be evicted, so the cache throws
     *
     *   LRUCache: calculateSize returned 0, but size must be > 0
     *
     * on every write (vercel/next.js#89033). Capping the cache at a sane 256 MB
     * did not help — the throw is in the size arithmetic, not the ceiling — and
     * 16.3.4 does not carry a fix, so 0 is the documented way out.
     *
     * The cost is small and bounded: images are still optimized and still sent
     * with cache headers, so browsers and any CDN in front of us cache them
     * exactly as before. Only the server-side copy on disk goes away, which
     * means a cold request re-encodes instead of reading a file. For a logo,
     * two avatars and a handful of product shots that is not a real expense.
     *
     * Revisit once upstream fixes the size calculation.
     */
    maximumDiskCacheSize: 0,

    /**
     * Where product photographs are allowed to come from.
     *
     * `next/image` refuses any remote host that is not listed here, so with an
     * empty list every uploaded product shot rendered as a broken image while
     * the bundled placeholder kept working — which made it look as though
     * nothing had been uploaded.
     *
     * Locally that host is MinIO on :9000. In a deployment it is whatever
     * `AWS_S3_PUBLIC_URL` points at, so it is read from the environment rather
     * than hard-coded; set `NEXT_PUBLIC_MEDIA_HOST` to the bare hostname.
     */
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "9000", pathname: "/**" },
      ...(process.env.NEXT_PUBLIC_MEDIA_HOST
        ? ([
            {
              protocol: "https" as const,
              hostname: process.env.NEXT_PUBLIC_MEDIA_HOST,
              pathname: "/**",
            },
          ])
        : []),
    ],
  },
};

export default nextConfig;
