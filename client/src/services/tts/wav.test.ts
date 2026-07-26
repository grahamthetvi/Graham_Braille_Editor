import { describe, expect, it } from 'vitest';
import { encodeMp3FromFloat32 } from './encodeMp3';
import { concatFloat32, normalizeSpeechText, wavBytesToPcm } from './wav';

function makeSilentWav(sampleRate: number, frames: number): Uint8Array {
  const dataSize = frames * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buf);
}

describe('tts wav helpers', () => {
  it('normalizes soft line breaks', () => {
    expect(normalizeSpeechText('a\rb\r\nc')).toBe('a b\nc');
  });

  it('parses mono 16-bit WAV', () => {
    const wav = makeSilentWav(16000, 100);
    const { samples, sampleRate } = wavBytesToPcm(wav);
    expect(sampleRate).toBe(16000);
    expect(samples.length).toBe(100);
  });

  it('concatenates float chunks', () => {
    const out = concatFloat32([new Float32Array([1, 2]), new Float32Array([3])]);
    expect([...out]).toEqual([1, 2, 3]);
  });
});

describe('encodeMp3FromFloat32', () => {
  it('produces a non-empty MP3 blob', () => {
    const samples = new Float32Array(24000);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 24000) * 0.2;
    }
    const blob = encodeMp3FromFloat32(samples, 24000);
    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBeGreaterThan(100);
  });
});
