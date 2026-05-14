/**
 * Rasterize an image to RGBA bytes for STL height-map extrusion (optional near-white → transparent).
 */

import { makeNearWhiteTransparent } from './whiteBackground';

export type SerializableLogoRaster = {
  width: number;
  height: number;
  /** RGBA row-major, length width * height * 4 */
  data: ArrayBuffer;
};

const DEFAULT_MAX_EDGE_PX = 384;

/** Alpha threshold for “solid” voxels (matches {@link buildBrailleStlBinary} print-text path). */
export const LOGO_ALPHA_THRESHOLD = 128;

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unexpected FileReader result.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed.'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load logo image.'));
    img.src = src;
  });
}

async function loadBitmapLike(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  try {
    const bmp = await createImageBitmap(blob);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch (err) {
    if (typeof document === 'undefined') throw err;
    const url = await readBlobAsDataUrl(blob);
    const img = await loadImageElement(url);
    return { source: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  }
}

export async function imageBlobToSerializableRaster(
  blob: Blob,
  options?: { maxEdgePx?: number; removeNearWhite?: boolean; nearWhiteMinChannel?: number; allowUpscale?: boolean },
): Promise<{ raster: SerializableLogoRaster; pngBlob: Blob }> {
  const maxEdge = options?.maxEdgePx ?? DEFAULT_MAX_EDGE_PX;
  const bmp = await loadBitmapLike(blob);
  try {
    let { width, height } = bmp;
    if (width <= 0 || height <= 0) {
      throw new Error('Logo image has no drawable size.');
    }
    const fitScale = maxEdge / Math.max(width, height);
    const scale = options?.allowUpscale ? fitScale : Math.min(1, fitScale);
    if (scale !== 1) {
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context unavailable.');
    }
    ctx.drawImage(bmp.source, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    if (options?.removeNearWhite) {
      makeNearWhiteTransparent(imageData.data, { minChannel: options.nearWhiteMinChannel });
      ctx.putImageData(imageData, 0, 0);
    }
    const copy = new Uint8ClampedArray(imageData.data);
    const raster: SerializableLogoRaster = {
      width,
      height,
      data: copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
    };
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    return { raster, pngBlob };
  } finally {
    bmp.close?.();
  }
}
