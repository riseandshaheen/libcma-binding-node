import * as esbuild from "esbuild";

/**
 * Bundle the dApp entrypoint but keep native addons external so
 * node-gyp-build can load .node binaries at runtime (riscv64 machine).
 */
await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.js",
  packages: "bundle",
  external: [
    "@riseandshaheen/libcma",
    "@deroll/cmio",
    "node-gyp-build",
    "node-addon-api",
  ],
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
});

console.log("esbuild → dist/index.js");
