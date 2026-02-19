/**
 * Braille Worker — runs in a Web Worker context.
 *
 * This file is loaded as a Web Worker so that liblouis WASM translation
 * never blocks the main UI thread.
 *
 * Message protocol (main → worker):
 *   { type: 'TRANSLATE', payload: { text: string, table: string } }
 *
 * Message protocol (worker → main):
 *   { type: 'RESULT',  payload: { brf: string } }
 *   { type: 'ERROR',   payload: { message: string } }
 *   { type: 'READY' }   // emitted once liblouis has initialised
 */

// Declare self as DedicatedWorkerGlobalScope for correct typings
declare const self: DedicatedWorkerGlobalScope;

// ---------------------------------------------------------------------------
// liblouis-js integration (lazy import so the worker can still run as a mock)
// ---------------------------------------------------------------------------

let liblouisReady = false;
let translateFn: ((table: string, text: string) => string) | null = null;

async function initLiblouis() {
  try {
    // Attempt to dynamically import liblouis-js.
    // The package exposes a UMD/ESM module; adjust the import path to match
    // whichever build artefact is available after `npm install liblouis`.
    // @ts-ignore
    // @ts-ignore
    const liblouisModule = await import(/* @vite-ignore */ 'liblouis-js');
    const factory = (liblouisModule as any).default || liblouisModule;

    // liblouis-js exposes an async factory; initialise with the WASM blob URL.
    const instance = await factory({ wasmBinaryFile: '/liblouis.wasm' });
    translateFn = (table: string, text: string) =>
      instance.translateString(table, text) as string;

    liblouisReady = true;
    self.postMessage({ type: 'READY' });
  } catch {
    // liblouis is not available (e.g. during initial scaffold / CI).
    // Fall back to the mock translator so the UI remains functional.
    console.warn('[braille-worker] liblouis not available, using mock translator.');
    translateFn = mockTranslate;
    liblouisReady = true;
    self.postMessage({ type: 'READY' });
  }
}

/**
 * Mock translator: converts ASCII text to a trivial dot-pattern placeholder.
 * Replace this with real liblouis once the WASM binary is available.
 */
function mockTranslate(_table: string, text: string): string {
  // Map each character to a simple placeholder Braille cell representation.
  // Real Braille conversion requires liblouis tables.
  return text
    .split('')
    .map((ch) => {
      if (ch === '\n') return '\n';
      if (ch === ' ') return ' ';
      // Use Unicode Braille block as a stub (⠁ = 0x2801)
      const code = ch.charCodeAt(0);
      const brailleChar = String.fromCodePoint(0x2800 + (code % 64));
      return brailleChar;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, payload } = event.data as {
    type: string;
    payload?: { text: string; table?: string };
  };

  if (type === 'TRANSLATE') {
    if (!liblouisReady || !translateFn) {
      self.postMessage({ type: 'ERROR', payload: { message: 'liblouis not ready yet.' } });
      return;
    }

    try {
      const table = payload?.table ?? 'en-ueb-g2.ctb';
      const text = payload?.text ?? '';
      const brf = translateFn(table, text);
      self.postMessage({ type: 'RESULT', payload: { brf } });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
});

// Kick off initialisation immediately when the worker starts.
initLiblouis();
