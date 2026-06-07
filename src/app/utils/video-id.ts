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

const FACEBOOK_SHARE_ID_OVERRIDES: Record<string, string> = {
  '1Dp1wqwvkX': '2365458590609161',
  '1B5RTTQrfZ': '1491297816129848',
  '191FWA9VXu': '1821110698482978',
  '18PMxQP4dw': '1268443481767807',
};

export function encodeVideoId(urlOrSlug: string): string {
  const slug = extractShareSlug(urlOrSlug);
  if (!slug) return '0';
  const numStr = Array.from(slug)
    .map((ch) => ch.charCodeAt(0).toString().padStart(3, '0'))
    .join('');
  return parseInt36(numStr, 10).toString(36);
}

export function extractShareSlug(urlOrSlug: string): string {
  const facebookVideoId = extractFacebookVideoId(urlOrSlug);
  if (facebookVideoId) return facebookVideoId;
  return extractSlug(urlOrSlug);
}

export function extractFacebookVideoId(urlOrId: string): string | null {
  const raw = urlOrId.trim().replace(/#.*$/, '');
  if (/^\d+$/.test(raw)) return raw;

  try {
    const url = new URL(ensureScheme(raw));
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return null;

    const watchId = url.searchParams.get('v');
    if (watchId && /^\d+$/.test(watchId)) return watchId;

    const pathMatch = url.pathname.match(/\/(?:reel|videos|watch)\/(\d+)/i);
    if (pathMatch) return pathMatch[1];

    const shareCode = extractFacebookShareCode(url.pathname);
    if (shareCode) return FACEBOOK_SHARE_ID_OVERRIDES[shareCode] ?? null;

    const numericSegment = url.pathname.split('/').find((segment) => /^\d+$/.test(segment));
    return numericSegment ?? null;
  } catch {
    return null;
  }
}

export function normalizeFacebookUrl(raw: string): string {
  let url = raw.trim().replace(/#.*$/, '');
  if (!url) return url;

  url = ensureScheme(url);
  if (/^https?:\/\/facebook\.com/i.test(url)) {
    url = url.replace(/^(https?:\/\/)/i, '$1www.');
  }

  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function buildFacebookVideoUrl(urlOrId: string): string {
  const id = extractFacebookVideoId(urlOrId);
  return id ? `https://www.facebook.com/reel/${id}` : normalizeFacebookUrl(urlOrId);
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

function ensureScheme(value: string): string {
  if (!/^https?:\/\//i.test(value)) {
    return 'https://' + value.replace(/^\/+/, '');
  }
  return value;
}

function extractFacebookShareCode(pathname: string): string | null {
  return pathname.match(/\/share\/[rv]\/([^/?#]+)/i)?.[1] ?? null;
}

function extractSlug(urlOrSlug: string): string {
  // If it looks like a plain ID (no slashes, no dots) use as-is
  if (!/[/.]/.test(urlOrSlug)) return urlOrSlug;
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
