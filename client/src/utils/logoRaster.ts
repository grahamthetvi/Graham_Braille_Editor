/**
 * Rasterize an image (e.g. PNG after background removal) to RGBA bytes for STL height-map extrusion.
 */

export type SerializableLogoRaster = {
  width: number;
  height: number;
  /** RGBA row-major, length width * height * 4 */
  data: ArrayBuffer;
};

const DEFAULT_MAX_EDGE_PX = 384;

/** Alpha threshold for “solid” voxels (matches {@link buildBrailleStlBinary} print-text path). */
export const LOGO_ALPHA_THRESHOLD = 128;

export async function imageBlobToSerializableRaster(
  blob: Blob,
  options?: { maxEdgePx?: number },
): Promise<{ raster: SerializableLogoRaster; pngBlob: Blob }> {
  const maxEdge = options?.maxEdgePx ?? DEFAULT_MAX_EDGE_PX;
  const bmp = await createImageBitmap(blob);
  try {
    let { width, height } = bmp;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    if (scale < 1) {
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context unavailable.');
    }
    ctx.drawImage(bmp, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const copy = new Uint8ClampedArray(imageData.data);
    const raster: SerializableLogoRaster = {
      width,
      height,
      data: copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
    };
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    return { raster, pngBlob };
  } finally {
    bmp.close();
  }
}
