export type MediaType =
  | 'youtube'
  | 'youtube-short'
  | 'instagram'
  | 'facebook-reel'
  | 'facebook'
  | 'dailymotion'
  | 'vimeo'
  | 'other-video'
  | 'post';

export interface MediaItem {
  sNo: number;
  type: MediaType;
  url: string;
  isProtected: boolean;
  title: string;
  desc: string;
  startTime: number | null;
}
