/**
 * Shareable video IDs are derived from the video's URL slug.
 *
 * - Short IDs (e.g. YouTube ID "K6o9JTcPgOA") are used directly.
 * - Full URLs are reduced to their last meaningful path segment.
 * - The slug is then base36-encoded for a compact, URL-safe ID.
 *
 * Encoding: each char code is zero-padded to 3 digits, concatenated,
 * then parsed as a BigInt and converted to base-36.
 *
 * This makes the ID permanent as long as the URL column doesn't change.
 */

export function encodeVideoId(urlOrSlug: string): string {
  const slug = extractSlug(urlOrSlug);
  if (!slug) return '0';
  const numStr = Array.from(slug)
    .map((ch) => ch.charCodeAt(0).toString().padStart(3, '0'))
    .join('');
  return parseInt36(numStr, 10).toString(36);
}

export function decodeVideoId(encoded: string): string {
  if (!encoded || encoded === '0') return '';
  try {
    let numStr = parseInt36(encoded, 36).toString(10);
    while (numStr.length % 3 !== 0) numStr = '0' + numStr;
    let slug = '';
    for (let i = 0; i < numStr.length; i += 3) {
      const code = Number(numStr.substring(i, i + 3));
      if (code > 0) slug += String.fromCharCode(code);
    }
    return slug;
  } catch {
    return '';
  }
}

function parseInt36(s: string, radix: number): bigint {
  const r = BigInt(radix);
  let result = 0n;
  for (const ch of s) {
    const digit = parseInt(ch, radix);
    if (Number.isNaN(digit)) return 0n;
    result = result * r + BigInt(digit);
  }
  return result;
}

function extractSlug(urlOrSlug: string): string {
  // If it looks like a plain ID (no slashes, no dots) use as-is
  if (!/[\/.]/.test(urlOrSlug)) return urlOrSlug;
  // Otherwise extract last meaningful path segment
  try {
    const u = new URL(urlOrSlug);
    const segments = u.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? urlOrSlug;
  } catch {
    // Not a valid URL, try splitting by /
    const segments = urlOrSlug.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? urlOrSlug;
  }
}
