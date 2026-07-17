#!/usr/bin/env bash
# Build the N-API addon for linux-riscv64 against real libcma.a.
# Intended to run inside a riscv64 Node image (or qemu-user), e.g.:
#
#   docker run --rm --platform linux/riscv64 -v "$PWD":/work -w /work \
#     cartesi/node:22.14.0-noble \
#     bash -lc 'apt-get update && apt-get install -y build-essential python3 make g++ wget &&
#               npm ci && npm run build:libcma:riscv64 && npm run build:native'
#
# Produces: build/Release/cma_napi.node with kind === "native-libcma"

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

if [[ "$(uname -m)" != "riscv64" && "${LIBCMA_FORCE_REAL:-}" != "1" ]]; then
  echo "warning: host is $(uname -m); set LIBCMA_FORCE_REAL=1 only if libcma.a matches this arch." >&2
fi

bash "${ROOT}/scripts/build-libcma-riscv64.sh"

export LIBCMA_FORCE_REAL=1
export LIBCMA_LIB_DIR="${LIBCMA_LIB_DIR:-${ROOT}/deps/machine-asset-tools/build/riscv64}"

npm run build:native

node -e "
const { createRequire } = require('module');
const requireFromRoot = createRequire(require('path').join('${ROOT}', 'package.json'));
const binding = requireFromRoot('node-gyp-build')('${ROOT}');
const l = binding.openEtherBuffer(8);
console.log('kind=', l.kind);
if (l.kind !== 'native-libcma') {
  console.error('expected native-libcma, got', l.kind);
  process.exit(1);
}
l.close();
console.log('ok: real libcma backend loaded');
"
