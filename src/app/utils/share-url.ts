import { environment } from '../../environments/environment';

export function buildVideoShareUrl(videoId: string): string {
  const configuredBaseUrl = environment.ANDROID_PUBLIC_BASE_URL.trim().replace(/\/$/, '');
  const baseUrl = configuredBaseUrl || location.origin;
  return `${baseUrl}/video/${encodeURIComponent(videoId)}`;
}
