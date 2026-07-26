import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * Encode mono float32 PCM (−1…1) to an MP3 Blob via lamejs.
 */
export function encodeMp3FromFloat32(samples: Float32Array, sampleRate: number, kbps = 128): Blob {
  const int16 = floatTo16BitPCM(samples);
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const blockSize = 1152;
  const parts: Uint8Array[] = [];

  for (let i = 0; i < int16.length; i += blockSize) {
    const chunk = int16.subarray(i, i + blockSize);
    const buf = encoder.encodeBuffer(chunk);
    if (buf.length > 0) parts.push(new Uint8Array(buf));
  }
  const flush = encoder.flush();
  if (flush.length > 0) parts.push(new Uint8Array(flush));

  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}

function floatTo16BitPCM(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
