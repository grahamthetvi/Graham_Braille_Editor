#!/usr/bin/env bash
# build-inside.sh — runs inside the emscripten/emsdk container.
# Expects:
#   /src/liblouis   — liblouis source at the pinned tag
#   /src/out        — output directory (mounted)
#   /src/VERSION    — pinned version string
set -euo pipefail

cd /src/liblouis

if [[ -f ./configure ]]; then
  echo "[build-liblouis] using existing ./configure from release tarball"
elif [[ -f ./autogen.sh ]]; then
  echo "[build-liblouis] running autogen.sh..."
  chmod +x ./autogen.sh
  ./autogen.sh
else
  echo "error: no configure or autogen.sh in liblouis source" >&2
  exit 1
fi

echo "[build-liblouis] configuring UTF-16 (no UCS-4)..."
emconfigure ./configure --disable-shared --prefix=/src/out-install
emmake make -j"$(nproc)"
emmake make install

mkdir -p /src/out

EXPORTED_FUNCTIONS='_lou_version,_lou_translateString,_lou_translate,_lou_backTranslateString,_lou_backTranslate,_lou_compileString,_lou_getTable,_lou_checkTable,_lou_free,_lou_charSize,_lou_setLogLevel,_lou_registerLogCallback,_lou_setDataPath,_lou_getDataPath,_malloc,_free'

EXPORTED_RUNTIME_METHODS='FS,ccall,cwrap,stringToUTF16,UTF16ToString,UTF8ToString,getValue,setValue,addFunction,removeFunction,lengthBytesUTF16,HEAP16,HEAP32,HEAPU8'

echo "[build-liblouis] linking WASM (MODULARIZE, EXPORT_NAME=liblouis_emscripten)..."
emcc ./liblouis/.libs/liblouis.a \
  -O2 \
  -sWASM=1 \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=liblouis_emscripten \
  -sENVIRONMENT=web,worker \
  -sFORCE_FILESYSTEM=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=33554432 \
  -sSTACK_SIZE=2097152 \
  -sRESERVED_FUNCTION_POINTERS=16 \
  -sALLOW_TABLE_GROWTH=1 \
  -sEXPORTED_FUNCTIONS="${EXPORTED_FUNCTIONS}" \
  -sEXPORTED_RUNTIME_METHODS="${EXPORTED_RUNTIME_METHODS}" \
  -o /src/out/liblouis.js

rm -rf /src/out/tables
cp -a /src/out-install/share/liblouis/tables /src/out/tables
cp /src/VERSION /src/out/VERSION

python3 - <<'PY'
from pathlib import Path
js = Path('/src/out/liblouis.js')
wasm = Path('/src/out/liblouis.wasm')
assert wasm.read_bytes()[:4] == b'\0asm', 'emcc did not produce WASM'
print('[build-liblouis] wrote', js.stat().st_size, 'byte glue')
print('[build-liblouis] wrote', wasm.stat().st_size, 'byte wasm')
print('[build-liblouis] tables:', len(list(Path('/src/out/tables').iterdir())))
PY

echo "[build-liblouis] done."
