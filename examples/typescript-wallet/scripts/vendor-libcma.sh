#!/usr/bin/env bash
# Copy the parent libcma-binding-node package into vendor/ for Docker / cartesi build
# contexts that start from this example directory.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$(cd "${ROOT}/../.." && pwd)"
DEST="${ROOT}/vendor/libcma-binding-node"

rm -rf "${DEST}"
mkdir -p "${ROOT}/vendor"
# Prefer rsync if available; fall back to tar to skip heavy dirs.
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude node_modules \
    --exclude build \
    --exclude lib \
    --exclude examples \
    --exclude 'deps/machine-asset-tools/build' \
    --exclude 'deps/machine-asset-tools/third-party' \
    "${PKG}/" "${DEST}/"
else
  mkdir -p "${DEST}"
  tar -C "${PKG}" \
    --exclude=node_modules --exclude=build --exclude=lib --exclude=examples \
    --exclude=deps/machine-asset-tools/build \
    --exclude=deps/machine-asset-tools/third-party \
    -cf - . | tar -C "${DEST}" -xf -
fi

echo "[vendor] ${DEST}"
ls "${DEST}" | head
