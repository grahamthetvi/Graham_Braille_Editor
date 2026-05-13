/**
 * Lazy-loads @imgly/background-removal from jsDelivr (same pattern as the reference app.js).
 */

let removeBackgroundFnPromise: Promise<(input: Blob | ArrayBuffer | ImageData) => unknown> | null =
  null;

export async function getBackgroundRemover(): Promise<
  (input: Blob | ArrayBuffer | ImageData) => unknown
> {
  if (removeBackgroundFnPromise) return removeBackgroundFnPromise;

  const moduleUrl = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm';
  removeBackgroundFnPromise = import(/* @vite-ignore */ moduleUrl)
    .then((mod: Record<string, unknown>) => {
      const candidates = [
        mod.default,
        mod.removeBackground,
        mod.removeBg,
        mod.default &&
          typeof mod.default === 'object' &&
          mod.default !== null &&
          'removeBackground' in mod.default &&
          (mod.default as { removeBackground?: unknown }).removeBackground,
      ];
      const fn = candidates.find((c): c is (i: Blob | ArrayBuffer | ImageData) => unknown => typeof c === 'function');
      if (!fn) {
        throw new Error(`Could not find remover function. Module keys: ${Object.keys(mod).join(', ')}`);
      }
      return fn as (input: Blob | ArrayBuffer | ImageData) => unknown;
    })
    .catch((err: unknown) => {
      removeBackgroundFnPromise = null;
      throw err;
    });

  return removeBackgroundFnPromise;
}

export function normalizeReturnedBlob(result: unknown): Promise<Blob> {
  if (result instanceof Blob) {
    return Promise.resolve(result);
  }
  if (result && typeof result === 'object' && 'blob' in result && (result as { blob: unknown }).blob instanceof Blob) {
    return Promise.resolve((result as { blob: Blob }).blob);
  }
  if (result instanceof ArrayBuffer) {
    return Promise.resolve(new Blob([result], { type: 'image/png' }));
  }
  if (result && typeof result === 'object' && typeof (result as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
    const r = result as { arrayBuffer: () => Promise<ArrayBuffer>; type?: string };
    return r.arrayBuffer().then(ab => new Blob([ab], { type: r.type || 'image/png' }));
  }
  return Promise.reject(new Error('Unexpected output from background remover.'));
}
