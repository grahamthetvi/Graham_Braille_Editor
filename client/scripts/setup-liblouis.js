#!/usr/bin/env node
/**
 * setup-liblouis.js  (ESM — runs under Node ≥ 18)
 *
 * Installs liblouis WASM + tables + Easy API into public/.
 *
 * Preferred source (real WASM, pinned engine):
 *   client/vendor/liblouis/out/   produced by scripts/build-liblouis/build.sh
 *
 * Fallback for CI/Pages when vendor/out is absent:
 *   client/public/wasm/ and client/public/tables/ must already contain
 *   committed artifacts. This script then only refreshes easy-api.js.
 *
 * Flags:
 *   --from-vendor   require vendor/out (fail if missing)
 *   --check         verify public/wasm/liblouis.wasm is real WASM; exit 1 if not
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  cpSync,
} from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(__dirname, '..');
const publicDir = resolve(clientDir, 'public');
const wasmDir = join(publicDir, 'wasm');
const tablesDir = join(publicDir, 'tables');
const vendorOut = resolve(clientDir, 'vendor/liblouis/out');
const easyApiTemplate = resolve(__dirname, 'liblouis-easy-api.template.js');
const versionPin = resolve(__dirname, 'build-liblouis/VERSION');

const args = new Set(process.argv.slice(2));
const fromVendor = args.has('--from-vendor');
const checkOnly = args.has('--check');

function isRealWasm(filePath) {
  const fd = readFileSync(filePath);
  return fd.length >= 4 && fd[0] === 0x00 && fd[1] === 0x61 && fd[2] === 0x73 && fd[3] === 0x6d;
}

mkdirSync(wasmDir, { recursive: true });
mkdirSync(tablesDir, { recursive: true });

if (checkOnly) {
  const wasmPath = join(wasmDir, 'liblouis.wasm');
  if (!existsSync(wasmPath) || !isRealWasm(wasmPath)) {
    console.error('FAIL: public/wasm/liblouis.wasm is missing or not a real WASM binary.');
    console.error('Run: ./client/scripts/build-liblouis/build.sh --install');
    process.exit(1);
  }
  const glue = join(wasmDir, 'liblouis.js');
  if (!existsSync(glue) || !readFileSync(glue, 'utf8').includes('liblouis_emscripten')) {
    console.error('FAIL: public/wasm/liblouis.js missing EXPORT_NAME=liblouis_emscripten');
    process.exit(1);
  }
  console.log('OK: real liblouis WASM + glue present.');
  process.exit(0);
}

const vendorReady =
  existsSync(join(vendorOut, 'liblouis.wasm')) &&
  existsSync(join(vendorOut, 'liblouis.js')) &&
  existsSync(join(vendorOut, 'tables'));

if (fromVendor && !vendorReady) {
  console.error(
    `Cannot find vendor build at ${vendorOut}.\n` +
      `Run: ./client/scripts/build-liblouis/build.sh`
  );
  process.exit(1);
}

if (vendorReady) {
  copyFileSync(join(vendorOut, 'liblouis.wasm'), join(wasmDir, 'liblouis.wasm'));
  copyFileSync(join(vendorOut, 'liblouis.js'), join(wasmDir, 'liblouis.js'));
  if (!isRealWasm(join(wasmDir, 'liblouis.wasm'))) {
    console.error('Vendor liblouis.wasm is not a real WASM binary.');
    process.exit(1);
  }
  console.log('✓  Copied WASM binary         → public/wasm/liblouis.wasm');
  console.log('✓  Copied Emscripten glue     → public/wasm/liblouis.js');

  rmSync(tablesDir, { recursive: true, force: true });
  mkdirSync(tablesDir, { recursive: true });
  cpSync(join(vendorOut, 'tables'), tablesDir, { recursive: true });
  const tableCount = readdirSync(tablesDir).length;
  console.log(`✓  Synced ${tableCount} braille tables → public/tables/`);

  const verFile = join(vendorOut, 'VERSION');
  if (existsSync(verFile)) {
    writeFileSync(join(wasmDir, 'LIBLOUIS_VERSION'), readFileSync(verFile));
  }
} else {
  const wasmPath = join(wasmDir, 'liblouis.wasm');
  if (!existsSync(wasmPath)) {
    console.error(
      'No vendor/liblouis/out build and no public/wasm/liblouis.wasm.\n' +
        'Run: ./client/scripts/build-liblouis/build.sh --install'
    );
    process.exit(1);
  }
  if (!isRealWasm(wasmPath)) {
    console.error(
      'public/wasm/liblouis.wasm is not a real WASM binary (legacy asm.js?).\n' +
        'Run: ./client/scripts/build-liblouis/build.sh --install'
    );
    process.exit(1);
  }
  console.log('✓  Using committed WASM artifacts in public/wasm/');
}

// ── Math tables live in liblouisutdml (moved out of core liblouis) ───────────
const MATH_TABLES = ['nemeth.ctb', 'marburg.ctb', 'ukmaths.ctb', 'wiskunde.ctb'];
const MATH_TABLE_BASE =
  'https://raw.githubusercontent.com/liblouis/liblouisutdml/master/lbu_files';

async function ensureMathTables() {
  let fetched = 0;
  for (const name of MATH_TABLES) {
    const dest = join(tablesDir, name);
    if (existsSync(dest) && readFileSync(dest, 'utf8').includes('include')) {
      continue;
    }
    const resp = await fetch(`${MATH_TABLE_BASE}/${name}`);
    if (!resp.ok) {
      console.warn(`⚠  Could not fetch math table ${name} (HTTP ${resp.status})`);
      continue;
    }
    writeFileSync(dest, await resp.text());
    fetched++;
  }
  if (fetched > 0) {
    console.log(`✓  Fetched ${fetched} math tables from liblouisutdml → public/tables/`);
  } else {
    console.log('✓  Math tables present (nemeth/marburg/ukmaths/wiskunde)');
  }
}

await ensureMathTables();

if (!existsSync(easyApiTemplate)) {
  console.error(`Missing Easy API template: ${easyApiTemplate}`);
  process.exit(1);
}
copyFileSync(easyApiTemplate, join(wasmDir, 'easy-api.js'));
console.log('✓  Installed Easy API wrapper → public/wasm/easy-api.js');

if (existsSync(versionPin)) {
  const pin = readFileSync(versionPin, 'utf8').trim();
  console.log(`\nLibLouis asset setup complete (pin ${pin}).`);
} else {
  console.log('\nLibLouis asset setup complete.');
}
