/**
 * Make a stored image URL safe to put in `src` WITHOUT re-encoding it.
 *
 * `encodeURI` was used here, and it escapes `%` — so the `%2F` separators in a
 * presigned URL's `X-Amz-Credential` became `%252F`, the signature no longer
 * matched, the bucket answered with an error document, and the browser blocked
 * it. Every uploaded product photograph failed to load, which read as "there
 * are no images".
 *
 * A space is the only character that actually needs escaping in a stored key,
 * and escaping just that leaves existing percent-escapes intact.
 */
export function safeImageUrl(raw: unknown): string {
  const url = String(raw ?? "");
  return url ? url.replace(/ /g, "%20") : "";
}
