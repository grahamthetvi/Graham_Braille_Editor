#!/usr/bin/env node
/**
 * Translate samples/staff-clefs-lesson.txt to ASCII BRF via liblouis WASM.
 * Usage: node samples/generate-staff-clefs-brf.mjs
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const client = join(root, 'client');
const wasmDir = join(client, 'public/wasm');
const tablesDir = join(client, 'public/tables');
const sourcePath = join(here, 'staff-clefs-lesson.txt');
const outPrint = join(here, 'staff-clefs-lesson-print.txt');
const outG2 = join(here, 'staff-clefs-lesson-ueb-g2.brf');
const outG1 = join(here, 'staff-clefs-lesson-ueb-g1.brf');

const CELLS = 40;
const LINES = 25;
const TN_OPEN = ",'";
const TN_CLOSE = ",'";

const BRF_TO_UNICODE_OFFSETS = [
  0x00, 0x2e, 0x10, 0x3c, 0x2b, 0x29, 0x2f, 0x04, 0x37, 0x3e, 0x21, 0x2c, 0x20, 0x24, 0x28, 0x0c,
  0x34, 0x02, 0x06, 0x12, 0x32, 0x22, 0x16, 0x36, 0x26, 0x14, 0x31, 0x30, 0x23, 0x3f, 0x1c, 0x39,
  0x08, 0x01, 0x03, 0x09, 0x19, 0x11, 0x0b, 0x1b, 0x13, 0x0a, 0x1a, 0x05, 0x07, 0x0d, 0x1d, 0x15,
  0x0f, 0x1f, 0x17, 0x0e, 0x1e, 0x25, 0x27, 0x3a, 0x2d, 0x3d, 0x35, 0x2a, 0x33, 0x3b, 0x18, 0x38,
];

const UNICODE_OFFSET_TO_ASCII = (() => {
  const map = [];
  for (let i = 0; i < 64; i++) {
    const off = BRF_TO_UNICODE_OFFSETS[i];
    if (map[off] === undefined) map[off] = String.fromCharCode(0x20 + i);
  }
  map[0x33] = '|';
  return map;
})();

function unicodeBrailleToAscii(s) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x2800 && cp <= 0x28ff) {
      const mapped = UNICODE_OFFSET_TO_ASCII[cp - 0x2800];
      out += mapped !== undefined ? mapped : ch;
    } else {
      out += ch;
    }
  }
  return out;
}

function asciiBrailleToUnicode(s) {
  let out = '';
  for (const ch of s) {
    let code = ch.charCodeAt(0);
    if (code >= 0x60 && code <= 0x7f) code -= 0x20;
    const index = code - 0x20;
    if (index >= 0 && index < 64) {
      out += String.fromCharCode(0x2800 + BRF_TO_UNICODE_OFFSETS[index]);
    } else {
      out += ch;
    }
  }
  return out;
}

async function loadLiblouis() {
  const tmpDir = join(client, 'node_modules/.cache/liblouis-lesson');
  mkdirSync(tmpDir, { recursive: true });
  const glueSrc = readFileSync(join(wasmDir, 'liblouis.js'), 'utf8');
  const loaderPath = join(tmpDir, 'liblouis-loader.cjs');
  writeFileSync(
    loaderPath,
    glueSrc +
      '\nmodule.exports = (typeof liblouis_emscripten !== "undefined") ? liblouis_emscripten : module.exports;\n',
  );
  const require = createRequire(import.meta.url);
  const factory = require(loaderPath);
  const capi = await factory({
    wasmBinary: readFileSync(join(wasmDir, 'liblouis.wasm')),
    locateFile: (p) => join(wasmDir, p),
  });
  for (const name of readdirSync(tablesDir)) {
    capi.FS.writeFile('/' + name, new Uint8Array(readFileSync(join(tablesDir, name))));
  }
  return capi;
}

function makeTranslate(capi) {
  return function translate(table, text, back = false) {
    if (!text) return '';
    const L = text.length;
    const maxOut = Math.max(100, L * 12);
    const inPtr = capi._malloc((L + 1) * 2);
    const outPtr = capi._malloc(maxOut * 2);
    capi.stringToUTF16(text, inPtr, (L + 1) * 2);
    const inLen = capi._malloc(4);
    const outLen = capi._malloc(4);
    capi.setValue(inLen, L, 'i32');
    capi.setValue(outLen, maxOut, 'i32');
    const ok = capi.ccall(
      back ? 'lou_backTranslateString' : 'lou_translateString',
      'number',
      ['string', 'number', 'number', 'number', 'number', 'number', 'number'],
      [table, inPtr, inLen, outPtr, outLen, 0, 0, 0],
    );
    if (!ok) {
      for (const p of [inPtr, outPtr, inLen, outLen]) capi._free(p);
      throw new Error(`liblouis ${back ? 'back-' : ''}translate failed`);
    }
    const n = capi.getValue(outLen, 'i32');
    const chars = capi.HEAP16.subarray(outPtr >> 1, (outPtr >> 1) + n);
    const s = String.fromCharCode(...Array.from(chars));
    for (const p of [inPtr, outPtr, inLen, outLen]) capi._free(p);
    return s;
  };
}

function wrapWords(text, width, firstIndent, runIndent) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [''];
  const lines = [];
  let onFirst = true;
  let indent = firstIndent;
  let line = ' '.repeat(indent);
  let used = indent;

  const flush = () => {
    lines.push(line.replace(/\s+$/g, ''));
    onFirst = false;
    indent = runIndent;
    line = ' '.repeat(indent);
    used = indent;
  };

  for (const word of words) {
    const cap = width - indent;
    if (word.length > cap && used === indent) {
      let rest = word;
      while (rest.length > cap) {
        line = ' '.repeat(indent) + rest.slice(0, cap);
        lines.push(line);
        rest = rest.slice(cap);
        onFirst = false;
        indent = runIndent;
      }
      line = ' '.repeat(indent) + rest;
      used = indent + rest.length;
      continue;
    }
    if (used === indent) {
      line += word;
      used += word.length;
    } else if (used + 1 + word.length <= width) {
      line += ' ' + word;
      used += 1 + word.length;
    } else {
      flush();
      line += word;
      used += word.length;
    }
  }
  if (used > indent || lines.length === 0) lines.push(line.replace(/\s+$/g, ''));
  return lines;
}

function centerLine(text, width) {
  const t = text.trim();
  if (!t) return [''];
  if (t.length >= width) return wrapWords(t, width, 0, 0);
  const pad = Math.floor((width - t.length) / 2);
  return [' '.repeat(pad) + t];
}

function toBrailleNumber(num) {
  let chars = '#';
  for (const c of String(num)) {
    chars += c === '0' ? 'j' : String.fromCharCode('a'.charCodeAt(0) + Number(c) - 1);
  }
  return chars;
}

function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}

function looksLikeHeading(line) {
  return Boolean(line.trim()) && leadingSpaces(line) >= 4;
}

function paginate(lines, pageLines, width, startNum) {
  const body = pageLines - 1;
  const pages = [];
  let i = 0;
  let pageNum = startNum;
  while (i < lines.length) {
    let take = Math.min(body, lines.length - i);
    const more = i + take < lines.length;
    if (more) {
      while (take > 1 && looksLikeHeading(lines[i + take - 1])) take--;
      while (
        take > 2 &&
        !lines[i + take - 1].trim() &&
        looksLikeHeading(lines[i + take - 2])
      ) {
        take -= 2;
      }
    }
    const chunk = lines.slice(i, i + take);
    while (chunk.length < body) chunk.push('');
    chunk.push(toBrailleNumber(pageNum).padStart(width, ' '));
    pages.push(chunk);
    pageNum += 1;
    i += take;
  }
  return {
    text: pages.map((p) => p.join('\r\n')).join('\r\n\f') + '\r\n',
    nextNum: pageNum,
  };
}

function parseSource(raw) {
  const blocks = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/g, '');
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\.\w+)\s*(.*)$/);
    if (!m) {
      throw new Error(`Unmarked line: ${line}`);
    }
    blocks.push({ kind: m[1].slice(1), text: m[2] });
  }
  return blocks;
}

function render(blocks, translate, table, gradeNum) {
  const tr = (s) => unicodeBrailleToAscii(translate(table, s)).replace(/\|/g, '\\');
  const out = [];
  let pendingBlank = false;
  const emitBlank = () => {
    pendingBlank = true;
  };
  const emitLines = (ls) => {
    if (pendingBlank && out.length && out[out.length - 1] !== '') out.push('');
    pendingBlank = false;
    out.push(...ls);
  };

  for (const b of blocks) {
    switch (b.kind) {
      case 'blank':
        emitBlank();
        break;
      case 'newpage':
        pendingBlank = false;
        out.push('\f');
        break;
      case 'grade': {
        const text = b.text.replace(/\{n\}/g, String(gradeNum));
        emitLines(centerLine(tr(text), CELLS));
        break;
      }
      case 'title':
      case 'center': {
        const braille = tr(b.text);
        if (b.kind === 'title') emitBlank();
        emitLines(centerLine(braille, CELLS));
        if (b.kind === 'title') emitBlank();
        break;
      }
      case 'h1': {
        emitBlank();
        emitLines(centerLine(tr(b.text), CELLS));
        emitBlank();
        break;
      }
      case 'h2': {
        emitBlank();
        emitLines(wrapWords(tr(b.text), CELLS, 4, 4));
        break;
      }
      case 'p':
        emitLines(wrapWords(tr(b.text), CELLS, 2, 0));
        break;
      case 'tn': {
        const inner = tr(b.text);
        emitLines(wrapWords(`${TN_OPEN}${inner}${TN_CLOSE}`, CELLS, 2, 0));
        break;
      }
      case 'l':
        emitLines(wrapWords(tr(b.text), CELLS, 0, 2));
        break;
      default:
        throw new Error(`Unknown directive .${b.kind}`);
    }
  }

  // Expand form feeds into pagination segments.
  const segments = [];
  let cur = [];
  for (const line of out) {
    if (line === '\f') {
      segments.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  segments.push(cur);

  const pageChunks = [];
  let pageNum = 1;
  for (const seg of segments) {
    while (seg.length && seg[0] === '') seg.shift();
    while (seg.length && seg[seg.length - 1] === '') seg.pop();
    if (seg.length === 0) continue;
    const formatted = paginate(seg, LINES, CELLS, pageNum);
    pageNum = formatted.nextNum;
    pageChunks.push(formatted.text.replace(/\r\n$/u, ''));
  }
  return pageChunks.join('\r\n\f') + '\r\n';
}

function renderPrint(blocks) {
  const lines = [];
  const push = (s = '') => lines.push(s);
  for (const b of blocks) {
    switch (b.kind) {
      case 'blank':
        push();
        break;
      case 'newpage':
        push();
        push('* * *');
        push();
        break;
      case 'title':
        if (lines.length) push();
        push(b.text.toUpperCase());
        push();
        break;
      case 'center':
      case 'h2':
        push(b.text);
        break;
      case 'grade':
        push(b.text.replace(/\{n\}/g, '1 or 2'));
        break;
      case 'h1':
        push();
        push(b.text);
        push();
        break;
      case 'tn':
        push(`Transcriber's note: ${b.text}`);
        push();
        break;
      case 'p':
        push(b.text);
        push();
        break;
      case 'l':
        push(`  ${b.text}`);
        break;
      default:
        throw new Error(`Unknown directive .${b.kind}`);
    }
  }
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

function assertBrf(ascii) {
  const pages = ascii.split('\f');
  for (let p = 0; p < pages.length; p++) {
    let chunk = pages[p];
    if (chunk.startsWith('\r\n')) chunk = chunk.slice(2);
    if (chunk.endsWith('\r\n')) chunk = chunk.slice(0, -2);
    if (chunk.endsWith('\r')) chunk = chunk.slice(0, -1);
    const rawLines = chunk.split('\r\n');
    if (rawLines.length !== LINES) {
      console.error('--- page', p + 1, 'line count', rawLines.length, '---');
      rawLines.forEach((l, i) => console.error(String(i + 1).padStart(2), JSON.stringify(l)));
      throw new Error(`Page ${p + 1} has ${rawLines.length} lines, expected ${LINES}`);
    }
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].replace(/\r/g, '');
      if (line.length > CELLS) {
        throw new Error(`Page ${p + 1} line ${i + 1} is ${line.length} cells: ${JSON.stringify(line)}`);
      }
      for (const ch of line) {
        const c = ch.charCodeAt(0);
        if (c !== 0x20 && (c < 0x21 || c > 0x7e)) {
          throw new Error(`Non-ASCII BRF cell U+${c.toString(16)} on page ${p + 1} line ${i + 1}`);
        }
      }
    }
  }
}

const capi = await loadLiblouis();
const translate = makeTranslate(capi);
const blocks = parseSource(readFileSync(sourcePath, 'utf8'));
writeFileSync(outPrint, renderPrint(blocks), 'utf8');
console.log(`Wrote ${outPrint}`);

for (const [table, dest, gradeNum] of [
  ['en-ueb-g2.ctb', outG2, 2],
  ['en-ueb-g1.ctb', outG1, 1],
]) {
  const brf = render(blocks, translate, table, gradeNum);
  assertBrf(brf);
  writeFileSync(dest, brf, 'ascii');
  const preview = brf
    .split('\f')[0]
    .split('\r\n')
    .slice(0, 12)
    .join('\n');
  const back = unicodeBrailleToAscii(
    translate(table, asciiBrailleToUnicode(brf.replace(/\f/g, '\n').replace(/\r/g, '')), true),
  );
  console.log(`Wrote ${dest} (${brf.split('\f').length} pages)`);
  console.log('--- first page (ASCII BRF) ---');
  console.log(preview);
  console.log('--- back-translate excerpt ---');
  console.log(back.slice(0, 500).replace(/\s+/g, ' '));
  console.log('');
}
