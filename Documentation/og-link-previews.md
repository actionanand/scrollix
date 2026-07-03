# Open Graph Link Previews

How Scrollix builds link previews (title, description, image, logo) for `post` rows, and why
Facebook, Instagram, and Reddit need special handling on Android.

The logic lives in:

- `src/app/services/link-preview.service.ts` — platform routing, caching, sanitization.
- `src/app/components/post-card/post-card.ts` — decides between an iframe embed and an OG preview.
- `scripts/patch-android-pip.mjs` — generates the native Android `ScrollixBrowserPlugin.java` that
  fetches previews on-device.

---

## 1. Where previews come from

`LinkPreviewService.getPreview(url)` first checks an in-memory + `localStorage` cache, then fetches:

| Platform    | Fetch strategy                                                                  |
| ----------- | ------------------------------------------------------------------------------- |
| **Web**     | `fetchOgDirect(url)` (direct HTML fetch + OG parse) → fallback to Microlink API |
| **Android** | Native `ScrollixBrowser.fetchPreview({ url })` only — **never** Microlink       |

Android does all OG processing locally, so it does not consume the Microlink quota.

### Post cards: embed vs. OG preview

`post-card.ts` renders Facebook/Instagram post URLs as **official iframe embeds** on the web
(`plugins/post.php` and `/embed/`). On **Android** those embeds render poorly inside the WebView, so
`postEmbedKind()` returns `null` and every post — including Facebook/Instagram — falls through to the
native OG preview path instead.

---

## 2. Web OG image processing

1. `fetchOgDirect` downloads the page HTML with the app's normal fetch and parses `og:*` /
   `twitter:*` meta tags via `parseOgTags`.
2. If nothing usable is found, it falls back to the Microlink API (`api.microlink.io`).
3. `sanitizePreviewImage` drops emoji sprites, `data:` URIs from the web path, Facebook static
   `rsrc.php` assets, and (for Facebook share posts) any non-`fbcdn.net` image.
4. The result is cached for 7 days (max 300 entries).

On the web the browser loads the returned image URL directly from a real origin, so hotlink /
referer checks on the CDN usually pass.

---

## 3. Android OG image processing

The native plugin (`fetchPreview`) runs on a background thread and:

1. Chooses a user agent. For Facebook, Instagram, and Reddit it uses the link-preview crawler UA
   `facebookexternalhit/1.1`; otherwise a normal mobile Chrome UA
   (`prefersCrawlerUserAgent`).
2. Downloads the HTML, following redirects (`downloadHtml`).
3. If a normal-UA fetch returns a bot/verification wall (`isChallengePage`), it retries once with the
   crawler UA.
4. For Facebook, resolves the real post page when the first response has no usable image
   (`resolvePreviewPage`) — following `og:url`, `<link rel="canonical">`, meta-refresh, embedded
   Facebook content URLs, and `m.`/`mbasic.` share fallbacks.
5. Extracts `og:*` / `twitter:*` metadata (`extractPreview`).
6. **Inlines the image** for Facebook/Instagram/Reddit (`resolveImage` → `inlineImage`): the image
   bytes are downloaded natively (crawler UA, ≤ 3 MB) and returned as a `data:<mime>;base64,…` URI.

### Why Facebook images fail on Android without inlining

- The Capacitor app is served from the origin `https://localhost` (`androidScheme: 'https'`).
- `index.html` sets `<meta name="referrer" content="strict-origin-when-cross-origin">`, so an
  `<img>` request sends `Referer: https://localhost`.
- Facebook `fbcdn.net` / `scontent.*` group-post images enforce a referer/origin check and return
  **HTTP 403** to that request. The title and description parse fine, but the image renders broken.
- WhatsApp and other apps work because they fetch the image server-side (no browser referer) and
  re-serve it.

**Fix:** the native layer — which already fetched the page with the crawler UA — also downloads the
image bytes and hands the WebView a `data:` URI. There is no CSP in `index.html`, so `data:` images
render freely, and Angular treats `data:image/*` as a safe `img` `src`.

### Reddit — "Please wait for verification"

Reddit serves an anti-bot verification interstitial to normal browsers but returns proper Open Graph
tags to known link-preview crawlers. Reddit is therefore treated like Facebook/Instagram: fetched
with the crawler UA from the start, with `isChallengePage` as an extra safety net for any other site
that shows a "just a moment" / "checking your browser" / captcha wall. Reddit preview images
(`preview.redd.it` / `external-preview.redd.it`) are also inlined to avoid the same referer block.

---

## 4. Caching notes

- Previews cache in-memory and in `localStorage` (`scrollix.linkPreviews`), 7-day TTL, 300 max.
- Inlined `data:` images can be large, so they are kept **in-memory only**; the persisted copy has
  its image stripped to avoid exceeding the storage quota.
- Because the persisted copy has no image, Facebook/Instagram/Reddit previews are re-fetched on the
  next cold start (`canUseCachedPreview` → `isMetaContentUrl`), which also refreshes any expired
  signed CDN image URLs.

---

## 5. Regenerating the native code

The Android Java is generated from a template. After changing `scripts/patch-android-pip.mjs`, run
the patch and rebuild:

```bash
node scripts/patch-android-pip.mjs
npx cap sync android
```
