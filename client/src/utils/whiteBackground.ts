/**
 * Makes near-white pixels fully transparent (RGBA). Non-white colors and alpha are preserved.
 */

export type NearWhiteOptions = {
  /** Treat a pixel as white if R, G, and B are all at least this value (0–255). */
  minChannel?: number;
};

/**
 * Sets alpha to 0 wherever RGB looks like white / paper background.
 * Does not alter non-white pixels (unlike ML matting, which can eat fine detail).
 */
export function makeNearWhiteTransparent(data: Uint8ClampedArray, options?: NearWhiteOptions): void {
  const T = options?.minChannel ?? 248;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r >= T && g >= T && b >= T) {
      data[i + 3] = 0;
    }
  }
}
