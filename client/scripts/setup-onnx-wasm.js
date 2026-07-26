#!/usr/bin/env node
/**
 * Copies onnxruntime-web WASM/JS assets into public/ort/ so TTS engines
 * load them from the app origin instead of stale third-party CDNs.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findOnnxRuntimeWeb() {
  const candidates = [
    resolve(__dirname, '..', 'node_modules', 'onnxruntime-web'),
    resolve(__dirname, '..', '..', 'node_modules', 'onnxruntime-web'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'package.json'))) return c;
  }
  throw new Error('onnxruntime-web not found — run npm install first');
}

const pkgRoot = findOnnxRuntimeWeb();
const distDir = join(pkgRoot, 'dist');
const outDir = resolve(__dirname, '..', 'public', 'ort');

mkdirSync(outDir, { recursive: true });

const patterns = [/^ort-wasm.*\.wasm$/, /^ort-wasm.*\.mjs$/];
let copied = 0;

for (const name of readdirSync(distDir)) {
  if (!patterns.some(re => re.test(name))) continue;
  copyFileSync(join(distDir, name), join(outDir, name));
  copied++;
}

if (copied === 0) {
  throw new Error(`No ort-wasm assets found in ${distDir}`);
}

console.log(`setup-onnx-wasm: copied ${copied} file(s) to public/ort/`);
