import { describe, expect, it } from 'vitest';
import { makeNearWhiteTransparent } from './whiteBackground';

describe('makeNearWhiteTransparent', () => {
  it('clears alpha only on near-white pixels', () => {
    const d = new Uint8ClampedArray([10, 10, 10, 255, 250, 250, 250, 255, 100, 100, 250, 200]);
    makeNearWhiteTransparent(d, { minChannel: 248 });
    expect(d[3]).toBe(255);
    expect(d[7]).toBe(0);
    expect(d[11]).toBe(200);
  });
});
