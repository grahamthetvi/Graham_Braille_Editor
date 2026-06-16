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
 *   { type: 'TRANSLATE', text, table?, mathCode? }
 *   { type: 'CONVERT_MATH_ONLY', text, mathCode? }
 *   { type: 'BACK_TRANSLATE', text: brf, table? }
 *
 * Message protocol  (worker → main):
 *   { type: 'READY' }
 *   { type: 'RESULT',   result: string, sourceText: string }
 *   { type: 'CONVERT_MATH_RESULT', result: string }
 *   { type: 'BACK_TRANSLATE_RESULT', plainText: string, brf: string }
 *   { type: 'PROGRESS', percent: number }   // 0–100, during chunked jobs
 *   { type: 'ERROR',    error:  string }
 */

// ─── Type shims for globals set by the loaded scripts ───────────────────────

interface TranslateResult {
  output: string;
  outputPos: number[];
}

interface LiblouisEasyApi {
  setLiblouisBuild(capi: object): void;
  translateString(table: string, text: string): string | null;
  translate(table: string, text: string): TranslateResult | null;
  backTranslateString(table: string, brf: string): string | null;
  enableOnDemandTableLoading(url: string): void;
  setLogLevel(level: number): void;
}

export interface WordMapData {
  srcToBrf: number[];
  srcToBrfEnd: number[];
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
const CHUNK_MAX_SIZE = 5_000;

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

let ready = false;
let liblouis: LiblouisEasyApi | undefined;

async function init(): Promise<void> {
  // ── Step 1: detect & load WASM or asm.js build ──────────────────────────
  const wasmUrl = `${BASE}/wasm/liblouis.wasm`;
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
  if (
    !liblouis ||
    typeof liblouis.translateString !== 'function' ||
    typeof liblouis.backTranslateString !== 'function'
  ) {
    throw new Error('easy-api.js did not expose a full liblouis instance on self');
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
import {
  NEMETH_INDICATOR_PAD,
  UEB_NEMETH_CLOSE,
  UEB_NEMETH_CLOSE_ASCII,
  UEB_NEMETH_OPEN,
  UEB_NEMETH_OPEN_ASCII,
  unicodeBrailleToAscii,
} from '../utils/braille';
import { DEFAULT_TABLE } from '../utils/tableRegistry';

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
  const cleaned = `<math>${match[1]}</math>`;
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
    return wrapMathBrailleForLiteraryContext(result || '', mathCode);
  } catch (err) {
    console.warn('[braille-worker] Math translation failed:', err, latex);
    return `[Math Error: ${latex}]`;
  }
}

/** Liblouis table for Nemeth body back-translation (matches tableRegistry). */
const NEMETH_BACK_TRANSLATE_TABLE = 'nemeth.ctb';

function wrapMathBrailleForLiteraryContext(braille: string, mathCode: string): string {
  if (mathCode !== 'nemeth' || !braille) return braille;
  if (braille.startsWith('[Math Error:')) return braille;
  return (
    UEB_NEMETH_OPEN +
    NEMETH_INDICATOR_PAD +
    braille +
    NEMETH_INDICATOR_PAD +
    UEB_NEMETH_CLOSE
  );
}

const SOFT_LINE_BREAK_CR = '\r';
const LEGACY_SOFT_LINE_LS = '\u2028';

// ─── Position-aware translation (for highlight mapping) ──────────────────────

interface TextWithPositions {
  output: string;
  outputPos: number[];
}

function translateTextWithPositions(text: string, table: string): TextWithPositions {
  if (!text) return { output: '', outputPos: [] };

  const outputPos = new Array<number>(text.length).fill(-1);
  const lines = text.split('\n');
  const resultLines: string[] = [];
  let srcOffset = 0;
  let outOffset = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    if (!line) {
      resultLines.push('');
    } else {
      const forTranslate = line
        .replaceAll(SOFT_LINE_BREAK_CR, ' ')
        .replaceAll(LEGACY_SOFT_LINE_LS, ' ');

      if (!forTranslate) {
        resultLines.push('');
      } else {
        const result = liblouis!.translate(table, forTranslate);

        if (result && result.outputPos) {
          resultLines.push(result.output);
          const linePos = result.outputPos;
          const len = Math.min(line.length, linePos.length);
          for (let i = 0; i < len; i++) {
            outputPos[srcOffset + i] = linePos[i] + outOffset;
          }
          outOffset += result.output.length;
        } else {
          const translated = liblouis!.translateString(table, forTranslate) || '';
          resultLines.push(translated);
          outOffset += translated.length;
        }
      }
    }

    if (li < lines.length - 1) {
      outputPos[srcOffset + line.length] = outOffset;
      srcOffset += line.length + 1;
      outOffset += 1;
    } else {
      srcOffset += line.length;
    }
  }

  return { output: resultLines.join('\n'), outputPos };
}

function translateTextWithPositionsAndFormFeeds(text: string, table: string): TextWithPositions {
  if (!text) return { output: '', outputPos: [] };
  if (!text.includes('\f')) return translateTextWithPositions(text, table);

  const outputPos = new Array<number>(text.length).fill(-1);
  const parts = text.split('\f');
  const resultParts: string[] = [];
  let srcOffset = 0;
  let outOffset = 0;

  for (let pi = 0; pi < parts.length; pi++) {
    const { output, outputPos: partPos } = translateTextWithPositions(parts[pi], table);
    for (let i = 0; i < parts[pi].length; i++) {
      if (partPos[i] >= 0) {
        outputPos[srcOffset + i] = partPos[i] + outOffset;
      }
    }
    resultParts.push(output);

    if (pi < parts.length - 1) {
      outputPos[srcOffset + parts[pi].length] = outOffset + output.length;
      srcOffset += parts[pi].length + 1;
      outOffset += output.length + 1;
    } else {
      srcOffset += parts[pi].length;
      outOffset += output.length;
    }
  }

  return { output: resultParts.join('\f'), outputPos };
}

async function translateDocumentWithMathAndPositions(
  text: string, textTable: string, mathCode: string
): Promise<{ result: string; outputPos: number[] }> {
  if (!liblouis) return { result: '', outputPos: [] };

  const outputPos = new Array<number>(text.length).fill(-1);
  const chunkRegex = /(\$\$(.*?)\$\$)|(\\\((.*?)\\\))|(:::chart\n([\s\S]*?)\n:::)|(:::graphic\n([\s\S]*?)\n:::)/gs;

  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = chunkRegex.exec(text)) !== null) {
    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore) {
      const seg = translateTextWithPositionsAndFormFeeds(textBefore, textTable);
      for (let i = 0; i < textBefore.length; i++) {
        if (seg.outputPos[i] >= 0) {
          outputPos[lastIndex + i] = seg.outputPos[i] + result.length;
        }
      }
      result += seg.output;
    }

    const matchStart = match.index;
    const matchLen = match[0].length;

    if (match[7] !== undefined) {
      const lines = match[8].split('\n');
      const graphicContent = '\n' + lines.map(l => '\u0001' + l).join('\n') + '\n';
      for (let i = 0; i < matchLen; i++) {
        outputPos[matchStart + i] = result.length + Math.floor(i * graphicContent.length / matchLen);
      }
      result += graphicContent;
    } else if (match[5] !== undefined) {
      const lines = match[6].split('\n');
      const chartContent = '\n' + lines.map(l => '\u0001' + l).join('\n') + '\n';
      for (let i = 0; i < matchLen; i++) {
        outputPos[matchStart + i] = result.length + Math.floor(i * chartContent.length / matchLen);
      }
      result += chartContent;
    } else {
      const latex = match[2] !== undefined ? match[2] : match[4];
      const mathResult = await translateMath(latex, mathCode);
      for (let i = 0; i < matchLen; i++) {
        outputPos[matchStart + i] = result.length + Math.floor(i * mathResult.length / matchLen);
      }
      result += mathResult;
    }

    lastIndex = chunkRegex.lastIndex;
  }

  const remainingText = text.slice(lastIndex);
  if (remainingText) {
    const seg = translateTextWithPositionsAndFormFeeds(remainingText, textTable);
    for (let i = 0; i < remainingText.length; i++) {
      if (seg.outputPos[i] >= 0) {
        outputPos[lastIndex + i] = seg.outputPos[i] + result.length;
      }
    }
    result += seg.output;
  }

  return { result: unicodeBrailleToAscii(result), outputPos };
}

function buildWordMap(sourceText: string, brfText: string, outputPos: number[]): WordMapData {
  const srcWords: { start: number; end: number }[] = [];
  const brfWords: { start: number; end: number }[] = [];
  const wordRe = /\S+/g;
  let m: RegExpExecArray | null;

  while ((m = wordRe.exec(sourceText)) !== null) {
    srcWords.push({ start: m.index, end: m.index + m[0].length });
  }
  wordRe.lastIndex = 0;
  while ((m = wordRe.exec(brfText)) !== null) {
    brfWords.push({ start: m.index, end: m.index + m[0].length });
  }

  const N = srcWords.length;
  const M = brfWords.length;

  if (N === 0 || M === 0) {
    return { srcToBrf: [], srcToBrfEnd: [] };
  }

  const srcToBrf = new Array<number>(N);
  const srcToBrfEnd = new Array<number>(N);

  for (let i = 0; i < N; i++) {
    const sw = srcWords[i];
    let minBrfPos = Infinity;
    let maxBrfPos = -1;

    for (let c = sw.start; c < sw.end; c++) {
      if (c < outputPos.length && outputPos[c] >= 0) {
        if (outputPos[c] < minBrfPos) minBrfPos = outputPos[c];
        if (outputPos[c] > maxBrfPos) maxBrfPos = outputPos[c];
      }
    }

    if (minBrfPos === Infinity) {
      const fallback = Math.min(M - 1, Math.floor(i * M / N));
      srcToBrf[i] = fallback;
      srcToBrfEnd[i] = fallback;
      continue;
    }

    let first = -1;
    let last = -1;
    for (let j = 0; j < M; j++) {
      const bw = brfWords[j];
      if (bw.start <= maxBrfPos && bw.end > minBrfPos) {
        if (first === -1) first = j;
        last = j;
      }
      if (bw.start > maxBrfPos) break;
    }

    if (first >= 0) {
      srcToBrf[i] = first;
      srcToBrfEnd[i] = last;
    } else {
      const fallback = Math.min(M - 1, Math.floor(i * M / N));
      srcToBrf[i] = fallback;
      srcToBrfEnd[i] = fallback;
    }
  }

  return { srcToBrf, srcToBrfEnd };
}

/**
 * Back-translates ASCII BRF line-by-line so newlines match the source file.
 * Grade 2 / contractions are not guaranteed to round-trip to the original prose.
 */
/**
 * Cleans up LibLouisUTDML semantic prefixes (like ^#, ^+, ^.K) from Nemeth back-translation.
 */
function cleanNemethBackTranslation(text: string): string {
  if (!text) return '';
  // 1. Convert Nemeth equals sign: ^.K or ^.k -> =
  let result = text.replace(/\^\.[kK]/g, '=');
  // 2. Remove Nemeth numeric indicator: ^#
  result = result.replace(/\^#/g, '');
  // 3. Clean up other standard prefixed operators/symbols (e.g. ^+ -> +, ^- -> -)
  result = result.replace(/\^([+\-*/()<>,'";:!_~`&\?{}|=])/g, '$1');
  return result;
}

/**
 * Back-translates ASCII BRF line-by-line so newlines match the source file.
 * Grade 2 / contractions are not guaranteed to round-trip to the original prose.
 */
function backTranslateTextPreservingNewlines(brf: string, table: string): string {
  if (!brf) return '';
  const lines = brf.split('\n');
  return lines.map(line => {
    if (!line) return '';
    const hasCR = line.endsWith('\r');
    const cleanLine = hasCR ? line.slice(0, -1) : line;
    if (!cleanLine) return hasCR ? '\r' : '';
    let plain = liblouis!.backTranslateString(table, cleanLine) || '';
    if (table === NEMETH_BACK_TRANSLATE_TABLE) {
      plain = cleanNemethBackTranslation(plain);
    }
    return hasCR ? plain + '\r' : plain;
  }).join('\n');
}

/**
 * Finds UEB Nemeth passage markers (Unicode or ASCII BRF), splits literary vs Nemeth body,
 * and back-translates each with the appropriate table.
 */
function splitNemethAsciiPassages(asciiBrf: string): Array<{ kind: 'lit' | 'nemeth'; text: string }> {
  const head = UEB_NEMETH_OPEN_ASCII + NEMETH_INDICATOR_PAD;
  const tail = NEMETH_INDICATOR_PAD + UEB_NEMETH_CLOSE_ASCII;
  const segments: Array<{ kind: 'lit' | 'nemeth'; text: string }> = [];
  let i = 0;
  while (i < asciiBrf.length) {
    const start = asciiBrf.indexOf(head, i);
    if (start === -1) {
      if (i < asciiBrf.length) {
        segments.push({ kind: 'lit', text: asciiBrf.slice(i) });
      }
      break;
    }
    if (start > i) {
      segments.push({ kind: 'lit', text: asciiBrf.slice(i, start) });
    }
    const afterOpen = start + head.length;
    const closeIdx = asciiBrf.indexOf(tail, afterOpen);
    if (closeIdx === -1) {
      segments.push({ kind: 'lit', text: asciiBrf.slice(start) });
      break;
    }
    segments.push({ kind: 'nemeth', text: asciiBrf.slice(afterOpen, closeIdx) });
    i = closeIdx + tail.length;
  }
  return segments;
}

function backTranslateBrfRespectingNemethPassages(brf: string, textTable: string): string {
  const ascii = unicodeBrailleToAscii(brf);
  const head = UEB_NEMETH_OPEN_ASCII + NEMETH_INDICATOR_PAD;
  if (ascii.indexOf(head) === -1) {
    return backTranslateTextPreservingNewlines(ascii, textTable);
  }
  const segments = splitNemethAsciiPassages(ascii);
  let plain = '';
  for (const seg of segments) {
    if (seg.kind === 'lit') {
      plain += backTranslateTextPreservingNewlines(seg.text, textTable);
    } else {
      const n = backTranslateTextPreservingNewlines(seg.text, NEMETH_BACK_TRANSLATE_TABLE);
      plain += n || seg.text;
    }
  }
  return plain;
}

/**
 * Extracts math blocks, translates them to Braille ASCII, and replaces the math
 * blocks in the original text, leaving the non-math text untouched.
 */
async function convertMathOnly(text: string, mathCode: string): Promise<string> {
  // Regex to match block math $$...$$, inline math \(...\), and chart blocks :::chart\n...\n:::
  const mathRegex = /(\$\$(.*?)\$\$)|(\\\((.*?)\\\))|(:::chart\n[\s\S]*?\n:::)|(:::graphic\n[\s\S]*?\n:::)/gs;

  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(text)) !== null) {
    // Keep the text *before* the math exactly as it is
    result += text.slice(lastIndex, match.index);

    if (match[5] !== undefined) {
      // Just pass the chart block through untouched
      result += match[5];
    } else if (match[6] !== undefined) {
      // Just pass the graphic block through untouched
      result += match[6];
    } else {
      // Determine which capture group matched (block is match[2], inline is match[4])
      const latex = match[2] !== undefined ? match[2] : match[4];

      // Translate the math
      const mathResult = await translateMath(latex, mathCode);
      result += mathResult;
    }

    lastIndex = mathRegex.lastIndex;
  }

  // Append any remaining text after the last math block
  result += text.slice(lastIndex);

  return unicodeBrailleToAscii(result);
}

// ─── Message handler ─────────────────────────────────────────────────────────

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, text, table = DEFAULT_TABLE, mathCode = 'nemeth' } = event.data as {
    type?: string;
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

  if (type === 'BACK_TRANSLATE') {
    const brf = text ?? '';
    try {
      if (!brf.trim()) {
        self.postMessage({ type: 'BACK_TRANSLATE_RESULT', plainText: '', brf });
      } else {
        const plainText = backTranslateBrfRespectingNemethPassages(brf, table);
        self.postMessage({ type: 'BACK_TRANSLATE_RESULT', plainText, brf });
      }
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (!text || !text.trim()) {
    self.postMessage({ type: 'RESULT', result: '', sourceText: text });
    return;
  }

  try {
    if (type === 'CONVERT_MATH_ONLY') {
      const result = await convertMathOnly(text, mathCode);
      self.postMessage({ type: 'CONVERT_MATH_RESULT', result });
    } else if (text.length <= CHUNK_THRESHOLD) {
      const { result, outputPos } = await translateDocumentWithMathAndPositions(text, table, mathCode);
      const wordMap = buildWordMap(text, result, outputPos);
      self.postMessage({ type: 'RESULT', result, sourceText: text, wordMap });
    } else {
      const chunks = splitIntoChunks(text);
      const results: string[] = [];
      const globalOutputPos = new Array<number>(text.length).fill(-1);
      let srcOffset = 0;
      let outOffset = 0;

      for (let i = 0; i < chunks.length; i++) {
        const { result, outputPos } = await translateDocumentWithMathAndPositions(chunks[i], table, mathCode);
        for (let j = 0; j < chunks[i].length; j++) {
          if (outputPos[j] >= 0) {
            globalOutputPos[srcOffset + j] = outputPos[j] + outOffset;
          }
        }
        srcOffset += chunks[i].length;
        outOffset += result.length;
        results.push(result);

        const percent = Math.round(((i + 1) / chunks.length) * 100);
        self.postMessage({ type: 'PROGRESS', percent });
      }

      const fullResult = results.join('');
      const wordMap = buildWordMap(text, fullResult, globalOutputPos);
      self.postMessage({ type: 'RESULT', result: fullResult, sourceText: text, wordMap });
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

