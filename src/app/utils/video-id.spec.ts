import {
  buildFacebookVideoUrl,
  buildTikTokEmbedUrl,
  buildTikTokVideoUrl,
  extractFacebookVideoId,
  extractTikTokVideoId,
} from './video-id';

describe('video-id helpers', () => {
  it('extracts the reel id from a resolved facebook share url', () => {
    const url =
      'https://www.facebook.com/reel/2365458590609161/?rdid=zzdc4yGiLAqkDG2Q&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fv%2F1Dp1wqwvkX%2F#';

    expect(extractFacebookVideoId(url)).toBe('2365458590609161');
    expect(buildFacebookVideoUrl(url)).toBe('https://www.facebook.com/reel/2365458590609161');
  });

  it('extracts ids from facebook links without requiring www', () => {
    expect(extractFacebookVideoId('facebook.com/reel/2365458590609161/')).toBe('2365458590609161');
    expect(extractFacebookVideoId('https://m.facebook.com/reel/2365458590609161/')).toBe(
      '2365458590609161',
    );
  });

  it('maps known facebook share codes to their resolved numeric ids', () => {
    expect(extractFacebookVideoId('https://www.facebook.com/share/v/1Dp1wqwvkX/')).toBe(
      '2365458590609161',
    );
    expect(buildFacebookVideoUrl('https://www.facebook.com/share/v/191FWA9VXu/')).toBe(
      'https://www.facebook.com/reel/1821110698482978',
    );
    expect(buildFacebookVideoUrl('https://www.facebook.com/share/r/18PMxQP4dw/')).toBe(
      'https://www.facebook.com/reel/1268443481767807',
    );
    expect(buildFacebookVideoUrl('https://www.facebook.com/share/r/18jaUaRFea/')).toBe(
      'https://www.facebook.com/reel/1641838417045674',
    );
  });

  it('uses the final numeric segment from facebook canonical video urls', () => {
    expect(
      extractFacebookVideoId(
        'https://www.facebook.com/61585386935792/videos/sometimes-going-back-to-our-roots/1641838417045674/',
      ),
    ).toBe('1641838417045674');
  });

  it('extracts and embeds tiktok video urls', () => {
    const url = 'https://www.tiktok.com/@looplandia.kids/video/7567139089972006160';

    expect(extractTikTokVideoId(url)).toBe('7567139089972006160');
    expect(buildTikTokEmbedUrl(url)).toContain(
      'https://www.tiktok.com/player/v1/7567139089972006160?',
    );
  });

  it('maps known tiktok share links to canonical video urls', () => {
    const shareUrl = 'https://vt.tiktok.com/ZSC83u8E6/';

    expect(extractTikTokVideoId(shareUrl)).toBe('7567139089972006160');
    expect(buildTikTokVideoUrl(shareUrl)).toBe(
      'https://www.tiktok.com/@looplandia.kids/video/7567139089972006160',
    );
    expect(buildTikTokEmbedUrl(shareUrl)).toContain(
      'https://www.tiktok.com/player/v1/7567139089972006160?',
    );
  });
});
