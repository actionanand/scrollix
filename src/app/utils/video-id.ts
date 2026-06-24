const FACEBOOK_SHARE_ID_OVERRIDES: Record<string, string> = {
  '1Dp1wqwvkX': '2365458590609161',
  '1B5RTTQrfZ': '1491297816129848',
  '191FWA9VXu': '1821110698482978',
  '18PMxQP4dw': '1268443481767807',
  '18jaUaRFea': '1641838417045674',
};

const TIKTOK_SHARE_URL_OVERRIDES: Record<string, string> = {
  ZSC83u8E6: 'https://www.tiktok.com/@looplandia.kids/video/7567139089972006160',
};

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

    const numericSegment = findLastNumericSegment(url.pathname);
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

export function extractTikTokVideoId(urlOrId: string): string | null {
  const raw = urlOrId.trim().replace(/#.*$/, '');
  if (/^\d+$/.test(raw)) return raw;

  try {
    const url = new URL(ensureScheme(raw));
    if (!/(^|\.)tiktok\.com$/i.test(url.hostname)) return null;

    const overrideUrl = resolveTikTokShareOverride(url);
    if (overrideUrl) return extractTikTokVideoId(overrideUrl);

    const videoMatch = url.pathname.match(/\/video\/(\d+)/i);
    if (videoMatch) return videoMatch[1];

    return findLastNumericSegment(url.pathname);
  } catch {
    return null;
  }
}

export function buildTikTokVideoUrl(urlOrId: string): string {
  const raw = urlOrId.trim().replace(/#.*$/, '');
  const overrideUrl = resolveTikTokShareOverrideFromRaw(raw);
  if (overrideUrl) return overrideUrl;

  try {
    const url = new URL(ensureScheme(raw));
    if (/(^|\.)tiktok\.com$/i.test(url.hostname)) {
      return url.origin + url.pathname.replace(/\/$/, '');
    }
  } catch {
    // Fall back to ID-only canonical URL below.
  }

  const id = extractTikTokVideoId(raw);
  return id ? `https://www.tiktok.com/@_/video/${id}` : raw;
}

export function buildTikTokEmbedUrl(urlOrId: string): string {
  const id = extractTikTokVideoId(urlOrId);
  return id ? `https://www.tiktok.com/embed/v2/${id}` : buildTikTokVideoUrl(urlOrId);
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

function resolveTikTokShareOverride(url: URL): string | null {
  if (!/^v[tm]\.tiktok\.com$/i.test(url.hostname)) return null;
  const code = url.pathname.split('/').filter(Boolean)[0];
  return code ? (TIKTOK_SHARE_URL_OVERRIDES[code] ?? null) : null;
}

function resolveTikTokShareOverrideFromRaw(raw: string): string | null {
  try {
    return resolveTikTokShareOverride(new URL(ensureScheme(raw)));
  } catch {
    return null;
  }
}

function findLastNumericSegment(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (/^\d+$/.test(segment)) return segment;
  }
  return null;
}
