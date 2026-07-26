/** Parse a RIFF/WAVE blob or byte array into mono float32 PCM (−1…1). */
export function wavBytesToPcm(bytes: ArrayBuffer | Uint8Array): {
  samples: Float32Array;
  sampleRate: number;
} {
  const buf = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const view = new DataView(buf);

  if (view.byteLength < 44 || getFourCC(view, 0) !== 'RIFF' || getFourCC(view, 8) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE audio file');
  }

  let offset = 12;
  let sampleRate = 22050;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const id = getFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (id === 'fmt ') {
      numChannels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (id === 'data') {
      dataOffset = chunkStart;
      dataSize = size;
      break;
    }
    offset = chunkStart + size + (size % 2);
  }

  if (dataOffset < 0) {
    throw new Error('WAVE file has no data chunk');
  }

  const frameCount = Math.floor(dataSize / (numChannels * (bitsPerSample / 8)));
  const samples = new Float32Array(frameCount);

  if (bitsPerSample === 16) {
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += view.getInt16(dataOffset + (i * numChannels + ch) * 2, true);
      }
      samples[i] = sum / numChannels / 32768;
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += view.getUint8(dataOffset + i * numChannels + ch) - 128;
      }
      samples[i] = sum / numChannels / 128;
    }
  } else if (bitsPerSample === 32) {
    // Assume IEEE float
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += view.getFloat32(dataOffset + (i * numChannels + ch) * 4, true);
      }
      samples[i] = sum / numChannels;
    }
  } else {
    throw new Error(`Unsupported WAVE bit depth: ${bitsPerSample}`);
  }

  return { samples, sampleRate };
}

function getFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Soft wraps / layout CR → space for speech. */
export function normalizeSpeechText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, ' ').trim();
}
