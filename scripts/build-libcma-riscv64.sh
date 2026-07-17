#!/usr/bin/env bash
# Cross-build (or native-build on riscv64) libcma.a into
# deps/machine-asset-tools/build/riscv64/libcma.a
#
# Mirrors libcma_binding_rust/build.rs. Requires:
#   - GNU make, wget, network
#   - On non-riscv64 hosts: g++-14-riscv64-linux-gnu / gcc-14-riscv64-linux-gnu
#     (override with CMA_RISCV64_CXX / CMA_RISCV64_CC)
#   - Or run inside a riscv64 container / Cartesi SDK image (native gcc)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAT="${ROOT}/deps/machine-asset-tools"
OUT="${MAT}/build/riscv64/libcma.a"

if [[ ! -d "${MAT}/include" ]]; then
  echo "error: ${MAT}/include missing — clone machine-asset-tools into deps/" >&2
  exit 1
fi

if [[ -f "${OUT}" && "${LIBCMA_FORCE_REBUILD:-}" != "1" ]]; then
  echo "[libcma] ${OUT} already exists (set LIBCMA_FORCE_REBUILD=1 to rebuild)"
  exit 0
fi

ARCH="$(uname -m)"
NLOHMANN="${MAT}/third-party/nlohmann/json.hpp"
mkdir -p "${MAT}/third-party/nlohmann"

if [[ ! -f "${NLOHMANN}" ]]; then
  echo "[libcma] fetching nlohmann/json.hpp"
  wget -qO "${NLOHMANN}" \
    https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp
fi

cd "${MAT}"

if [[ "${ARCH}" == "riscv64" ]]; then
  echo "[libcma] native riscv64 build"
  # Makefile uses `CXX := g++` (overrides env); pass on the command line.
  # Prefer g++-14 when present (-fhardened needs GCC ≥ 14).
  if [[ -z "${CXX:-}" ]]; then
    if command -v g++-14 >/dev/null 2>&1; then
      CXX=g++-14
    else
      CXX=g++
    fi
  fi
  if [[ -z "${CC:-}" ]]; then
    if command -v gcc-14 >/dev/null 2>&1; then
      CC=gcc-14
    else
      CC=gcc
    fi
  fi
  echo "[libcma] using CXX=${CXX} CC=${CC}"
  make third-party "CXX=${CXX}" "CC=${CC}"
  make build/riscv64/libcma.a "CXX=${CXX}" "CC=${CC}" "AR=${AR:-ar}"
else
  CXX="${CMA_RISCV64_CXX:-riscv64-linux-gnu-g++-14}"
  CC="${CMA_RISCV64_CC:-riscv64-linux-gnu-gcc-14}"
  if ! command -v "${CXX}" >/dev/null 2>&1; then
    echo "error: ${CXX} not found." >&2
    echo "Install the RISC-V GCC 14 cross toolchain, or run this script on riscv64 / in Docker." >&2
    echo "Example (Debian/Ubuntu): apt-get install g++-14-riscv64-linux-gnu" >&2
    exit 1
  fi
  echo "[libcma] cross-building with ${CXX}"
  make third-party TOOLCHAIN_PREFIX=riscv64-linux-gnu-
  make build/riscv64/libcma.a \
    TOOLCHAIN_PREFIX=riscv64-linux-gnu- \
    "CXX=${CXX}" \
    "CC=${CC}" \
    AR=riscv64-linux-gnu-ar
fi

test -f "${OUT}"
echo "[libcma] wrote ${OUT}"
ls -lh "${OUT}"
