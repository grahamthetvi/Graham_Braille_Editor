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

import { copyFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
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
// 2. Copy and Patch Easy API wrapper
// ---------------------------------------------------------------------------

const easyApiSrc = join(liblouisDir, 'easy-api.js');
const easyApiDest = join(wasmDir, 'easy-api.js');

let easyApiScript = readFileSync(easyApiSrc, 'utf8');

// Patch double-initialization bug: preserve the JS callback reference
// so subsequent calls to setLiblouisBuild don't erroneously pass an integer
// pointer back into registerLogCallback.
easyApiScript = easyApiScript.replace(
  'liblouis.registerLogCallback(liblouis._log_callback_fn_pointer);',
  'liblouis.registerLogCallback(liblouis._log_callback_js_fn || null);'
);
easyApiScript = easyApiScript.replace(
  'liblouis._log_callback_fn_pointer = capi.Runtime.addFunction(function(logLvl, msg) {',
  `liblouis._log_callback_js_fn = fn;
	liblouis._log_callback_fn_pointer = capi.Runtime.addFunction(function(logLvl, msg) {`
);

// Patch buffer-overflow and memory-leak bugs in liblouis.translateString:
// 1. Allocate correctly scaled char-size buffers.
// 2. Set outlen to the max number of characters the buffer can hold, preventing overflow.
// 3. Set inlen to the actual string character count instead of bytes.
// 4. Free resources on translation failure.
const patchedTranslateStringCode = `liblouis.translateString = function(table, inbuf, backtranslate) {

	if(typeof inbuf !== "string" || inbuf.length === 0) {
		return "";
	}

	var mode = 0;
	var char_size = liblouis.charSize() || 2;
	var L = inbuf.length;
	var max_out_len = Math.max(100, L * 10);

	var inbuff_ptr = capi._malloc((L + 1) * char_size);
	var outbuff_ptr = capi._malloc(max_out_len * char_size);

	capi.stringToUTF16(inbuf, inbuff_ptr, (L + 1) * char_size);

	// in emscripten we need a 32bit cell for each pointer
	var bufflen_ptr = capi._malloc(4);
	var strlen_ptr = capi._malloc(4);

	capi.setValue(bufflen_ptr, max_out_len, "i32");
	capi.setValue(strlen_ptr, L, "i32");

	var success = capi.ccall(backtranslate ?
			'lou_backTranslateString' :
			'lou_translateString', 'number', ['string',
			'number', 'number', 'number', 'number',
			'number', 'number'], [table, inbuff_ptr,
			strlen_ptr, outbuff_ptr, bufflen_ptr, null,
			null, mode]);

	if(!success) {
		capi._free(outbuff_ptr);
		capi._free(inbuff_ptr);
		capi._free(bufflen_ptr);
		capi._free(strlen_ptr);
		return null;
	}

	// string does not seam to be terminated by null byte,
	// therefore we cannot use emscripten to convert the buffer to
	// string.
	//var outstr = UTF16ToString(outbuff_ptr);
	var start_index = outbuff_ptr >> 1;
	var end_index = start_index + capi.getValue(bufflen_ptr, "i32");
	var outstr_buff = capi.HEAP16.slice(start_index, end_index);

	capi._free(outbuff_ptr);
	capi._free(inbuff_ptr);
	capi._free(bufflen_ptr);
	capi._free(strlen_ptr);

	return String.fromCharCode.apply(null, outstr_buff);
};`;

easyApiScript = easyApiScript.replace(
  /liblouis\.translateString = function\s*\(table,\s*inbuf,\s*backtranslate\)\s*\{[\s\S]*?return String\.fromCharCode\.apply\(null,\s*outstr_buff\);\s*\};/,
  patchedTranslateStringCode
);

// Inject liblouis.translate() — calls lou_translate with outputPos mapping
// so the highlight system can map source characters to braille output characters.
const translateMethod = `
liblouis.translate = function(table, inbuf) {

	if(typeof inbuf !== "string" || inbuf.length === 0) {
		return { output: "", outputPos: [] };
	}

	var mode = 0;
	var char_size = liblouis.charSize() || 2;
	var L = inbuf.length;
	var max_out_len = Math.max(100, L * 10);

	var inbuff_ptr = capi._malloc((L + 1) * char_size);
	var outbuff_ptr = capi._malloc(max_out_len * char_size);

	capi.stringToUTF16(inbuf, inbuff_ptr, (L + 1) * char_size);

	var inlen_ptr = capi._malloc(4);
	var outlen_ptr = capi._malloc(4);

	capi.setValue(inlen_ptr, L, "i32");
	capi.setValue(outlen_ptr, max_out_len, "i32");

	var outputPos_ptr = capi._malloc(L * 4);

	var success;
	try {
		success = capi.ccall('lou_translate', 'number',
			['string', 'number', 'number', 'number', 'number',
			 'number', 'number', 'number', 'number', 'number', 'number'],
			[table, inbuff_ptr, inlen_ptr, outbuff_ptr, outlen_ptr,
			 0, 0, outputPos_ptr, 0, 0, mode]);
	} catch(e) {
		capi._free(inbuff_ptr);
		capi._free(outbuff_ptr);
		capi._free(inlen_ptr);
		capi._free(outlen_ptr);
		capi._free(outputPos_ptr);
		return null;
	}

	if(!success) {
		capi._free(inbuff_ptr);
		capi._free(outbuff_ptr);
		capi._free(inlen_ptr);
		capi._free(outlen_ptr);
		capi._free(outputPos_ptr);
		return null;
	}

	var actualOutLen = capi.getValue(outlen_ptr, "i32");

	var start_index = outbuff_ptr >> 1;
	var end_index = start_index + actualOutLen;
	var outstr_buff = capi.HEAP16.slice(start_index, end_index);

	var inLen = inbuf.length;
	var outputPosArr = new Array(inLen);
	var base = outputPos_ptr >> 2;
	for(var i = 0; i < inLen; i++) {
		outputPosArr[i] = capi.HEAP32[base + i];
	}

	capi._free(inbuff_ptr);
	capi._free(outbuff_ptr);
	capi._free(inlen_ptr);
	capi._free(outlen_ptr);
	capi._free(outputPos_ptr);

	return { output: String.fromCharCode.apply(null, outstr_buff), outputPos: outputPosArr };
};
`;

easyApiScript = easyApiScript.replace(
  'liblouis.loadTable = function(tablename, url) {',
  translateMethod + '\nliblouis.loadTable = function(tablename, url) {'
);

writeFileSync(easyApiDest, easyApiScript);
console.log('✓  Copied & Patched Easy API wrapper → public/wasm/easy-api.js');

// ---------------------------------------------------------------------------
// 3. Copy ALL braille tables bundled in node_modules/liblouis-js/tables/
//    to ensure dependencies (like en-ueb-g1.ctb and braille-patterns.cti) 
//    are available at runtime.
// ---------------------------------------------------------------------------

import { readdirSync } from 'fs';

const localTablesDir = join(liblouisDir, 'tables');
const files = readdirSync(localTablesDir);

let copied = 0;
for (const file of files) {
  if (file.endsWith('.ctb') || file.endsWith('.cti') || file.endsWith('.uti') || file.endsWith('.utb') || file.endsWith('.dis') || file.endsWith('.tbl')) {
    const src = join(localTablesDir, file);
    const dest = join(tablesDir, file);
    copyFileSync(src, dest);
    copied++;
  }
}

console.log(`✓  Copied ${copied} braille tables  → public/tables/`);

console.log('\\nLibLouis asset setup complete. Run "npm run dev" to start the app.');
