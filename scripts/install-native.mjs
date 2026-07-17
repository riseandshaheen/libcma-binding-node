/**
 * Native install:
 * - Prefer prebuild / existing .node
 * - On riscv64 (or LIBCMA_FORCE_REAL=1): ensure libcma.a then rebuild against real libcma
 * - Else: host mock addon (best-effort; memory backend always works)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arch } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

if (process.env.LIBCMA_SKIP_NATIVE === "1") {
  console.log("[libcma] LIBCMA_SKIP_NATIVE=1 — skipping native build");
  process.exit(0);
}

const useReal =
  process.env.LIBCMA_FORCE_REAL === "1" || arch() === "riscv64";

try {
  const binding = require("node-gyp-build")(root);
  // If we need real libcma but an old mock prebuild loaded, rebuild.
  if (useReal) {
    const probe = binding.openEtherBuffer?.(4);
    const kind = probe?.kind;
    probe?.close?.();
    if (kind === "native-libcma") {
      console.log("[libcma] native-libcma addon ready");
      process.exit(0);
    }
    console.log(`[libcma] found addon kind=${kind}; rebuilding for real libcma`);
  } else {
    console.log("[libcma] native addon loaded (prebuild or previous build)");
    process.exit(0);
  }
} catch {
  // Fall through to compile.
}

if (!existsSync(join(root, "binding.gyp"))) {
  process.exit(0);
}

if (useReal) {
  const libPath = join(
    root,
    process.env.LIBCMA_LIB_DIR || "deps/machine-asset-tools/build/riscv64",
    "libcma.a",
  );
  if (!existsSync(libPath)) {
    console.log("[libcma] building libcma.a for riscv64…");
    const built = spawnSync("bash", ["scripts/build-libcma-riscv64.sh"], {
      cwd: root,
      stdio: "inherit",
    });
    if (built.status !== 0) {
      console.warn(
        "[libcma] failed to build libcma.a — install cross toolchain or run on riscv64.",
      );
      process.exit(0);
    }
  }
}

const env = { ...process.env };
if (useReal) {
  env.LIBCMA_FORCE_REAL = "1";
}

const result = spawnSync(
  process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
  ["rebuild"],
  {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  },
);

if (result.status !== 0) {
  console.warn(
    "[libcma] native build failed — TypeScript memory backend remains available for host use.",
  );
  console.warn(
    "[libcma] Set LIBCMA_SKIP_NATIVE=1 to silence this, or install build tools and retry `npm run build:native`.",
  );
  process.exit(0);
}
