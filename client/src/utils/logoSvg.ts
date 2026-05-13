/**
 * Wraps a PNG (e.g. cut-out logo) in a minimal SVG with an embedded raster.
 * Vector tracing is not performed; the SVG is a portable container for the processed bitmap.
 */

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === 'string') resolve(r.result);
      else reject(new Error('Unexpected FileReader result.'));
    };
    r.onerror = () => reject(r.error ?? new Error('FileReader failed.'));
    r.readAsDataURL(blob);
  });
}

export async function pngBlobToSvgDocument(blob: Blob, widthPx: number, heightPx: number): Promise<string> {
  const href = await blobToDataUrl(blob);
  const w = Math.max(1, Math.round(widthPx));
  const h = Math.max(1, Math.round(heightPx));
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<image width="${w}" height="${h}" preserveAspectRatio="none" href="${href}" />` +
    `</svg>`
  );
}
