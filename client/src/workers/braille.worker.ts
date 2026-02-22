/**
 * braille.worker.ts — ES module Web Worker (Vite worker format: 'es').
 *
 * Loading strategy
 * ─────────────────
 * Scripts are loaded via fetch() instead of importScripts() so this file
 * can run as a proper ES module worker. On first run the worker:
 *
 *   1. Fetches public/wasm/liblouis.wasm and checks the first four bytes.
 *      • If they match the WASM magic (0x00 0x61 0x73 0x6D), a true
 *        WebAssembly binary is present and is instantiated via the
 *        Emscripten glue loaded from public/wasm/liblouis.js.
 *      • Otherwise the file contains the asm.js fallback that the setup
 *        script writes when no compiled WASM binary is found.
 *   2. Fetches and executes public/wasm/easy-api.js.
 *   3. Enables on-demand table loading from public/tables/.
 *
 * Heavy-text chunking
 * ────────────────────
 * Texts above CHUNK_THRESHOLD characters are split into chunks at paragraph
 * boundaries (or by character count as a fallback). Each chunk is translated
 * independently and joined. PROGRESS messages are sent after each chunk so
 * the UI can render a live progress bar.
 *
 * Message protocol  (main → worker):
 *   { text: string, table?: string, mathCode?: string }
 *
 * Message protocol  (worker → main):
 *   { type: 'READY' }
 *   { type: 'RESULT',   result: string }
 *   { type: 'PROGRESS', percent: number }   // 0–100, during chunked jobs
 *   { type: 'ERROR',    error:  string }
 */

// ─── Type shims for globals set by the loaded scripts ───────────────────────

interface LiblouisEasyApi {
  setLiblouisBuild(capi: object): void;
  translateString(table: string, text: string): string | null;
  enableOnDemandTableLoading(url: string): void;
  setLogLevel(level: number): void;
}

interface LiblouisModule {
  calledRun: boolean;
  onRuntimeInitialized?: () => void;
  FS: object;
  Runtime: object;
  ccall: (...args: unknown[]) => unknown;
}

// ─── Chunking constants ───────────────────────────────────────────────────────

/**
 * Texts shorter than this are translated in a single call (no progress events).
 * Texts at or above this are split for streaming progress feedback.
 * ~5 000 chars ≈ 900 words — a comfortable chunk for liblouis.
 */
const CHUNK_THRESHOLD = 5_000;
const CHUNK_MAX_SIZE  = 5_000;

/**
 * Split `text` into chunks no larger than `maxSize`, breaking preferentially
 * at double-newline (paragraph) boundaries, then single-newline boundaries,
 * then at the hard character limit.
 *
 * The BRF separators between chunks are determined by whatever whitespace the
 * source text already contains at the split point — no synthetic newlines are
 * inserted, so the translated output mirrors the source structure.
 */
function splitIntoChunks(text: string, maxSize = CHUNK_MAX_SIZE): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }

    // Prefer a paragraph break (double newline) within the window
    const paraBreak = text.lastIndexOf('\n\n', end);
    if (paraBreak > start) {
      end = paraBreak + 2; // include both newline characters
    } else {
      // Fall back to any single newline
      const lineBreak = text.lastIndexOf('\n', end);
      if (lineBreak > start) {
        end = lineBreak + 1;
      }
      // Otherwise accept the hard boundary at maxSize
    }

    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch a URL and execute the response body as JavaScript in the worker's
 * global scope.  Used for non-ES-module scripts (Emscripten glue, easy-api).
 */
async function execRemoteScript(url: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url} — HTTP ${resp.status}`);
  }
  const src = await resp.text();
  // new Function executes in global scope so Emscripten/easy-api globals land on `self`
  new Function(src).call(self);
}

// ─── Initialisation ──────────────────────────────────────────────────────────

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, '');

let ready   = false;
let liblouis: LiblouisEasyApi | undefined;

async function init(): Promise<void> {
  // ── Step 1: detect & load WASM or asm.js build ──────────────────────────
  const wasmUrl  = `${BASE}/wasm/liblouis.wasm`;
  const wasmResp = await fetch(wasmUrl);
  if (!wasmResp.ok) {
    throw new Error(
      `Cannot load liblouis build from ${wasmUrl} (HTTP ${wasmResp.status}). ` +
      `Run "npm run setup:liblouis" first.`
    );
  }

  const rawBuffer = await wasmResp.arrayBuffer();
  const header = new Uint8Array(rawBuffer, 0, 4);
  const isRealWasm =
    header[0] === 0x00 &&
    header[1] === 0x61 &&
    header[2] === 0x73 &&
    header[3] === 0x6d;

  if (isRealWasm) {
    (self as unknown as Record<string, unknown>)['Module'] = { wasmBinary: rawBuffer };
    await execRemoteScript(`${BASE}/wasm/liblouis.js`);
  } else {
    const src = new TextDecoder().decode(rawBuffer);
    // new Function executes in global scope so the asm.js IIFE lands on `self`
    new Function(src).call(self);
  }

  // Wait for Emscripten runtime to complete initialisation.
  const capi = (self as unknown as Record<string, unknown>)['liblouis_emscripten'] as LiblouisModule;
  if (capi && !capi.calledRun) {
    await new Promise<void>((resolve) => {
      capi.onRuntimeInitialized = resolve;
    });
  }

  // ── Step 2: load the Easy API wrapper ───────────────────────────────────
  await execRemoteScript(`${BASE}/wasm/easy-api.js`);

  // ── Step 3: wire up and configure the Easy API ───────────────────────────
  liblouis = (self as unknown as Record<string, unknown>)['liblouis'] as LiblouisEasyApi;
  if (!liblouis || typeof liblouis.translateString !== 'function') {
    throw new Error('easy-api.js did not expose a liblouis instance on self');
  }

  if (capi) liblouis.setLiblouisBuild(capi);

  liblouis.setLogLevel(30000); // suppress debug noise; keep WARN+
  liblouis.enableOnDemandTableLoading(`${BASE}/tables/`);

  ready = true;
  self.postMessage({ type: 'READY' });
  console.info('[braille-worker] ready (isRealWasm =', isRealWasm, ')');
}

// ─── KaTeX & SRE Imports ──────────────────────────────────────────────────────
import katex from 'katex';
// @ts-expect-error - no types available for speech-rule-engine
import * as sre from 'speech-rule-engine';

// Initialize SRE for Nemeth or UEB Braille output
let currentMathCode = '';

async function ensureSreReady(mathCode: string) {
  if (currentMathCode === mathCode) return;
  const domain = mathCode === 'nemeth' ? 'nemeth' : 'default';
  const locale = mathCode === 'nemeth' ? 'nemeth' : 'en';
  await sre.setupEngine({
    domain: domain,
    modality: 'braille',
    // We don't need spoken output, just the braille ascii
    locale: locale,
  });
  currentMathCode = mathCode;
}

// ─── Math Pipeline Helpers ──────────────────────────────────────────────────

/**
 * Strips the outer <math> tag namespace and display attributes from MathML
 */
function cleanMathML(mathml: string): string {
  // Isolate just the <math>...</math> block, KaTeX wraps it with HTML spans
  const match = mathml.match(/<math[^>]*>([\s\S]*?)<\/math>/i);
  if (!match) return mathml;

  // Let's preserve the whole math tag but remove namespaces to be safe
  let cleaned = `<math>${match[1]}</math>`;
  return cleaned;
}

/**
 * Translates LaTeX math into Nemeth or UEB math Braille Code
 */
async function translateMath(latex: string, mathCode: string): Promise<string> {
  try {
    // Ensure the engine is booted for appropriate format
    await ensureSreReady(mathCode);

    // 1. Convert LaTeX to MathML string
    const katexHtml = katex.renderToString(latex, {
      output: 'mathml', // Only give us the MathML
      throwOnError: false,
    });

    // 2. Clean the MathML (KaTeX still mixes some HTML in the output sometimes, or at least wrapper spans)
    const cleanXml = cleanMathML(katexHtml);

    // 3. Translate using Nemeth SRE Engine
    const result = sre.toSpeech(cleanXml);
    return result || '';
  } catch (err) {
    console.warn('[braille-worker] Math translation failed:', err, latex);
    return `[Math Error: ${latex}]`;
  }
}

/**
 * Extracts math blocks, translates them, and translates the surrounding text.
 */
async function translateDocumentWithMath(text: string, textTable: string, mathCode: string): Promise<string> {
  if (!liblouis) return '';

  // Regex to match block math $$...$$ and inline math \(...\)
  // We use a unified regex for both
  const mathRegex = /(\$\$(.*?)\$\$)|(\\\((.*?)\\\))/gs;

  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(text)) !== null) {
    // Translate the text *before* the math
    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore) {
      result += liblouis.translateString(textTable, textBefore) || '';
    }

    // Determine which capture group matched (block is match[2], inline is match[4])
    const latex = match[2] !== undefined ? match[2] : match[4];

    // Translate the math
    const mathResult = await translateMath(latex, mathCode);
    result += mathResult;

    lastIndex = mathRegex.lastIndex;
  }

  // Translate any remaining text after the last math block
  const remainingText = text.slice(lastIndex);
  if (remainingText) {
    result += liblouis.translateString(textTable, remainingText) || '';
  }

  return result;
}

/**
 * Splits text into sensible chunks, avoiding splitting mid-word or mid-math.
 */
function splitIntoChunks(text: string, maxLen: number = 2000): string[] {
  const chunks: string[] = [];
  let current = 0;
  while (current < text.length) {
    if (text.length - current <= maxLen) {
      chunks.push(text.slice(current));
      break;
    }
    // Try to find a good break point
    let breakIndex = current + maxLen;
    const substr = text.slice(current, breakIndex);
    // Find the last newline or space
    const lastNewline = substr.lastIndexOf('\n');
    const lastSpace = substr.lastIndexOf(' ');

    // Prioritize newlines, then spaces. If neither, force break.
    let offset = lastNewline > 0 ? lastNewline : (lastSpace > 0 ? lastSpace : maxLen);

    chunks.push(text.slice(current, current + offset + 1));
    current += offset + 1;
  }
  return chunks;
}

// ─── Message handler ─────────────────────────────────────────────────────────

self.addEventListener('message', async (event: MessageEvent) => {
  const { text, table = 'en-ueb-g2.ctb', mathCode = 'nemeth' } = event.data as {
    text: string;
    table?: string;
    mathCode?: string;
  };

  if (!ready || !liblouis) {
    self.postMessage({
      type: 'ERROR',
      error: 'liblouis is not ready yet — wait for the READY message.',
    });
    return;
  }

  if (!text || !text.trim()) {
    self.postMessage({ type: 'RESULT', result: '' });
    return;
  }

  const CHUNK_THRESHOLD = 5000;

  try {
    if (text.length <= CHUNK_THRESHOLD) {
      // ── Direct translation (small text) ─────────────────────────────────
      const result = liblouis.translateString(table, text);
      if (result === null) {
        throw new Error(`translateString returned null — check table "${table}"`);
      }
      self.postMessage({ type: 'RESULT', result });
    } else {
      // ── Chunked translation (large text) ─────────────────────────────────
      const chunks  = splitIntoChunks(text);
      const results: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const part = liblouis.translateString(table, chunks[i]);
        if (part === null) {
          throw new Error(
            `translateString returned null on chunk ${i + 1}/${chunks.length} — check table "${table}"`
          );
        }
        results.push(part);

        // Report progress after each chunk (received by main thread in real-time
        // because the worker runs on a separate OS thread).
        const percent = Math.round(((i + 1) / chunks.length) * 100);
        self.postMessage({ type: 'PROGRESS', percent });
      }

      self.postMessage({ type: 'RESULT', result: results.join('') });
    }
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Kick off initialisation immediately on worker start.
init().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[braille-worker] init failed:', msg);
  self.postMessage({ type: 'ERROR', error: `Worker init failed: ${msg}` });
});

