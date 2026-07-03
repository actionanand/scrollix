import { environment } from '../../environments/environment';

export type VideoShareTarget = 'web' | 'android';

export function buildVideoShareUrl(videoId: string, target: VideoShareTarget = 'web'): string {
  return target === 'android' ? buildAndroidVideoShareUrl(videoId) : buildWebVideoShareUrl(videoId);
}

export function buildWebVideoShareUrl(videoId: string): string {
  return buildShareUrl(environment.PUBLIC_BASE_URL || location.origin, videoId);
}

export function buildAndroidVideoShareUrl(videoId: string): string {
  return buildShareUrl(environment.ANDROID_PUBLIC_BASE_URL, videoId);
}

function buildShareUrl(baseUrl: string, videoId: string): string {
  const configuredBaseUrl = baseUrl.trim();
  const encodedId = encodeURIComponent(videoId);
  if (configuredBaseUrl.endsWith('://')) return `${configuredBaseUrl}video/${encodedId}`;
  return `${configuredBaseUrl.replace(/\/$/, '')}/video/${encodedId}`;
}
