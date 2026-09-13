#!/usr/bin/env node
/**
 * Copies Piper phonemize .wasm/.data into public/piper/ so the TTS engine
 * loads them from the app origin instead of jsDelivr (often blocked on
 * school/corporate networks).
 *
 * Prefers @diffusionstudio/piper-wasm in node_modules; otherwise fetches
 * the pinned 1.0.0 assets from jsDelivr at postinstall.
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPER_WASM_VERSION = '1.0.0';
const FILES = ['piper_phonemize.wasm', 'piper_phonemize.data'];
const JSDELIVR_BASE =
  `https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@${PIPER_WASM_VERSION}/build`;

function findPiperWasmBuild() {
  const candidates = [
    resolve(__dirname, '..', 'node_modules', '@diffusionstudio', 'piper-wasm', 'build'),
    resolve(__dirname, '..', '..', 'node_modules', '@diffusionstudio', 'piper-wasm', 'build'),
  ];
  for (const dir of candidates) {
    if (FILES.every(name => existsSync(join(dir, name)))) return dir;
  }
  return null;
}

const outDir = resolve(__dirname, '..', 'public', 'piper');
mkdirSync(outDir, { recursive: true });

const pkgBuild = findPiperWasmBuild();
if (pkgBuild) {
  for (const name of FILES) {
    copyFileSync(join(pkgBuild, name), join(outDir, name));
  }
  console.log(`setup-piper-phonemize: copied ${FILES.length} file(s) from npm package to public/piper/`);
  process.exit(0);
}

for (const name of FILES) {
  const dest = join(outDir, name);
  if (existsSync(dest)) continue;
  const url = `${JSDELIVR_BASE}/${name}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`setup-piper-phonemize: failed to download ${url} (${resp.status})`);
  }
  writeFileSync(dest, Buffer.from(await resp.arrayBuffer()));
  console.log(`setup-piper-phonemize: downloaded ${name}`);
}

console.log('setup-piper-phonemize: public/piper/ ready');
