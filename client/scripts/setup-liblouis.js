#!/usr/bin/env node
/**
 * setup-liblouis.js  (ESM — runs under Node ≥ 18)
 *
 * Prepares public/wasm/ and public/tables/ for the braille Web Worker.
 *
 * Steps
 * ─────
 * 1. Copy liblouis.wasm from node_modules/liblouis-js/build/
 *    (If the build dir ships no .wasm — e.g. the asm.js-only npm release —
 *    fall back to copying the asm.js build so the app still works; a
 *    warning is printed to guide the developer toward a real WASM build.)
 * 2. Copy easy-api.js from node_modules/liblouis-js/
 * 3. Download en-ueb-g2.ctb (Grade 2) and en-us-g1.ctb (Grade 1)
 *    directly from the liblouis/liblouis GitHub repository.
 *
 * Outputs
 * ───────
 *   public/wasm/liblouis.wasm  — WASM binary (or asm.js fallback)
 *   public/wasm/easy-api.js    — liblouis Easy API JS wrapper
 *   public/tables/en-ueb-g2.ctb
 *   public/tables/en-us-g1.ctb
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Resolve node_modules — support both client-local and monorepo-root installs
// ---------------------------------------------------------------------------

function findInNodeModules(packageName) {
  const candidates = [
    resolve(__dirname, '..', 'node_modules', packageName),
    resolve(__dirname, '..', '..', 'node_modules', packageName),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    `Cannot find "${packageName}" in node_modules. ` +
    `Run "npm install" in the client or project root first.`
  );
}

const liblouisDir = findInNodeModules('liblouis-js');

// ---------------------------------------------------------------------------
// Ensure output directories exist
// ---------------------------------------------------------------------------

const publicDir = resolve(__dirname, '..', 'public');
const wasmDir = join(publicDir, 'wasm');
const tablesDir = join(publicDir, 'tables');

mkdirSync(wasmDir, { recursive: true });
mkdirSync(tablesDir, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Copy WASM binary (or asm.js fallback)
// ---------------------------------------------------------------------------

const wasmSrc = join(liblouisDir, 'build', 'liblouis.wasm');
const wasmDest = join(wasmDir, 'liblouis.wasm');

if (existsSync(wasmSrc)) {
  copyFileSync(wasmSrc, wasmDest);
  console.log('✓  Copied WASM binary         → public/wasm/liblouis.wasm');
} else {
  // asm.js fallback: the official npm release of liblouis-js ships only an
  // Emscripten asm.js build — no .wasm binary is included.
  // Copy the asm.js file so the worker can still function, but warn loudly.
  const asmSrc = join(liblouisDir, 'liblouis-no-tables.js');
  copyFileSync(asmSrc, wasmDest);

  console.warn(
    '\n⚠️  WARNING: No liblouis.wasm found in node_modules/liblouis-js/build/\n' +
    '    The installed liblouis-js package provides only an asm.js build.\n' +
    '    An asm.js fallback has been written to public/wasm/liblouis.wasm\n' +
    '    so the app is functional, but for full WebAssembly performance\n' +
    '    you must compile liblouis from source with Emscripten (-s WASM=1)\n' +
    '    and place the resulting liblouis.wasm in node_modules/liblouis-js/build/.\n'
  );
}

// ---------------------------------------------------------------------------
// 2. Copy Easy API wrapper
// ---------------------------------------------------------------------------

const easyApiSrc = join(liblouisDir, 'easy-api.js');
const easyApiDest = join(wasmDir, 'easy-api.js');
copyFileSync(easyApiSrc, easyApiDest);
console.log('✓  Copied Easy API wrapper    → public/wasm/easy-api.js');

// ---------------------------------------------------------------------------
// 3. Fetch braille tables from liblouis/liblouis GitHub
//    with a fallback to the copies bundled in node_modules/liblouis-js/tables/
// ---------------------------------------------------------------------------

const TABLES_BASE =
  'https://raw.githubusercontent.com/liblouis/liblouis/master/tables/';

const TABLES = [
  'en-ueb-g2.ctb',  // English UEB Grade 2 (default)
  'en-us-g1.ctb',   // English US Grade 1
];

for (const table of TABLES) {
  const dest = join(tablesDir, table);
  const url = TABLES_BASE + table;
  const localSrc = join(liblouisDir, 'tables', table);

  process.stdout.write(`  Fetching ${table} … `);

  let fetched = false;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (resp.ok) {
      const bytes = new Uint8Array(await resp.arrayBuffer());
      writeFileSync(dest, bytes);
      console.log(`✓  GitHub → public/tables/${table}`);
      fetched = true;
    } else {
      console.warn(`HTTP ${resp.status} from GitHub`);
    }
  } catch {
    // Network unavailable in this environment — fall through to local copy.
  }

  if (!fetched) {
    if (existsSync(localSrc)) {
      copyFileSync(localSrc, dest);
      console.log(`✓  node_modules fallback → public/tables/${table}`);
    } else {
      console.error(`ERROR: cannot fetch ${table} from GitHub and no local copy found.`);
      process.exit(1);
    }
  }
}

console.log('\nLibLouis asset setup complete. Run "npm run dev" to start the app.');
