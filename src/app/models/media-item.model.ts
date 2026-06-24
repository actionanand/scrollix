export type MediaType =
  | 'youtube'
  | 'youtube-short'
  | 'instagram'
  | 'facebook-reel'
  | 'facebook'
  | 'facebook-share'
  | 'tiktok'
  | 'tiktok-share'
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
  resolvedUrl: string;
}

export interface LinkPreview {
  title: string;
  description: string;
  image: string;
  url: string;
  logo: string;
}

export interface GvizCell {
  v?: string | number | boolean | null;
  f?: string;
}

export interface GvizRow {
  c: (GvizCell | null)[];
}

export interface GvizResponse {
  table: {
    rows: GvizRow[];
  };
}
