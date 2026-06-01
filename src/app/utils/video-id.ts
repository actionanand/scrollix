export function encodeVideoId(sNo: number): string {
  return (sNo * 997 + 42).toString(36);
}

export function decodeVideoId(encoded: string): number {
  return (parseInt(encoded, 36) - 42) / 997;
}
