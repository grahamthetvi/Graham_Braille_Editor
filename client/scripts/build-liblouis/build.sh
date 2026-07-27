#!/usr/bin/env bash
# build.sh — host orchestrator for liblouis WASM.
#
# Usage:
#   ./client/scripts/build-liblouis/build.sh
#   ./client/scripts/build-liblouis/build.sh --install
#
# Requires: podman (or docker), curl, tar, python3
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$SCRIPT_DIR/VERSION")"
VENDOR_DIR="$CLIENT_DIR/vendor/liblouis"
SRC_DIR="$VENDOR_DIR/src"
OUT_DIR="$VENDOR_DIR/out"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-}"

if [[ -z "$CONTAINER_RUNTIME" ]]; then
  if command -v podman >/dev/null 2>&1; then
    CONTAINER_RUNTIME=podman
  elif command -v docker >/dev/null 2>&1; then
    CONTAINER_RUNTIME=docker
  else
    echo "error: need podman or docker to build liblouis WASM" >&2
    exit 1
  fi
fi

# Pin emsdk image for reproducibility
EMSDK_IMAGE="${EMSDK_IMAGE:-docker.io/emscripten/emsdk:3.1.74}"

INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    -h|--help)
      echo "Usage: $0 [--install]"
      exit 0
      ;;
  esac
done

mkdir -p "$VENDOR_DIR" "$OUT_DIR"

TARBALL="$VENDOR_DIR/liblouis-${VERSION}.tar.gz"
if [[ ! -f "$TARBALL" ]]; then
  echo "[build-liblouis] downloading liblouis v${VERSION}..."
  curl -fsSL -o "$TARBALL" \
    "https://github.com/liblouis/liblouis/releases/download/v${VERSION}/liblouis-${VERSION}.tar.gz"
fi

rm -rf "$SRC_DIR"
mkdir -p "$SRC_DIR"
tar -xzf "$TARBALL" -C "$SRC_DIR" --strip-components=1

chmod +x "$SCRIPT_DIR/build-inside.sh"
cp "$SCRIPT_DIR/VERSION" "$VENDOR_DIR/VERSION"

echo "[build-liblouis] building with ${CONTAINER_RUNTIME} image ${EMSDK_IMAGE}..."
"$CONTAINER_RUNTIME" pull "$EMSDK_IMAGE"

# Build deps inside the container (autoconf tools for safety; release has configure).
"$CONTAINER_RUNTIME" run --rm \
  -v "$SRC_DIR:/src/liblouis:Z" \
  -v "$OUT_DIR:/src/out:Z" \
  -v "$SCRIPT_DIR/build-inside.sh:/src/build-inside.sh:Z,ro" \
  -v "$VENDOR_DIR/VERSION:/src/VERSION:Z,ro" \
  -w /src \
  "$EMSDK_IMAGE" \
  bash -lc '
    set -euo pipefail
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      autoconf automake libtool pkg-config python3 make >/dev/null
    bash /src/build-inside.sh
  '

python3 - <<PY
from pathlib import Path
out = Path("$OUT_DIR")
wasm = out / "liblouis.wasm"
data = wasm.read_bytes()[:4]
assert data == b"\0asm", f"not a WASM binary: {data!r}"
print(f"[build-liblouis] OK: {wasm} ({wasm.stat().st_size} bytes)")
js = out / "liblouis.js"
text = js.read_text()
assert "liblouis_emscripten" in text, "EXPORT_NAME missing from glue"
print(f"[build-liblouis] OK: {js} ({js.stat().st_size} bytes)")
tables = list((out / "tables").iterdir())
print(f"[build-liblouis] OK: {len(tables)} tables")
PY

if [[ "$INSTALL" -eq 1 ]]; then
  echo "[build-liblouis] installing into public/..."
  node "$CLIENT_DIR/scripts/setup-liblouis.js" --from-vendor
fi

echo "[build-liblouis] build complete (v${VERSION})."
