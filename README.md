# libcma-binding-node

Node.js / TypeScript bindings for **[libcma](https://github.com/Mugen-Builders/machine-asset-tools)** — the Cartesi proveable asset ledger used for **contracts v3 emergency withdrawal**.

| | |
| --- | --- |
| **npm** | [`@riseandshaheen/libcma`](https://www.npmjs.com/package/@riseandshaheen/libcma) (alpha — not published yet) |
| **repo** | [riseandshaheen/libcma-binding-node](https://github.com/riseandshaheen/libcma-binding-node) |
| **status** | Phase 1 — Ether MVP + host / riscv64 backends. See [ARCHITECTURE.md](./ARCHITECTURE.md). |

## Quick start

```sh
git clone --recurse-submodules https://github.com/riseandshaheen/libcma-binding-node.git
cd libcma-binding-node
npm install
npm test
```

```ts
import { Ledger, ACCOUNTS_DRIVE_PATH } from "@riseandshaheen/libcma";

// Host / unit tests — TypeScript memory backend (or native mock if built)
const ledger = Ledger.openEtherBuffer(
  { maxAccounts: 4096 },
  { backend: "memory" }, // force host memory; omit for auto (native if available)
);

ledger.depositEther("0x1111111111111111111111111111111111111111", 10n ** 18n);
ledger.transferEther(
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  25n * 10n ** 16n,
);
ledger.withdrawEther("0x2222222222222222222222222222222222222222", 10n ** 16n);
console.log(ledger.getEtherBalance("0x1111111111111111111111111111111111111111"));
ledger.close();
```

## What’s in this repo

| Path | Role |
| --- | --- |
| [`src/`](./src) + [`native/`](./native) | Published package: TypeScript API + N-API addon |
| [`templates/`](./templates) | Minimal JS/TS app boilerplates (start here for a new dApp) |
| [`examples/typescript-wallet`](./examples/typescript-wallet) | Fuller wallet demo (portals, transfer/withdraw actions, EW notes) |

## Templates

Copy-ready Cartesi Rollups v2 scaffolds with a libcma Ether ledger on `/dev/pmem1` — same idea as `cartesi create --template javascript|typescript`, plus the accounts drive and withdrawal config.

| Template | Entry | Host check |
| --- | --- | --- |
| [`templates/javascript`](./templates/javascript) | `src/index.js` (plain ESM) | `npm install && npm test` |
| [`templates/typescript`](./templates/typescript) | `src/index.ts` → esbuild | `npm install && npm test && npm run build` |

Both include:

- EtherPortal deposit → `ledger.creditEtherDeposit`
- `inspect balance/<address>`
- `sync` flush of the accounts drive before each yield
- `cartesi.toml` with a 4 MiB accounts drive and `[withdrawal.config]` (4096 × 32-byte leaves)

Add your logic in `handleInput` / `handleQuery`. Machine build:

```sh
cd templates/typescript   # or templates/javascript
./scripts/vendor-libcma.sh
cartesi build
cartesi run
```

Details: [`templates/README.md`](./templates/README.md).

## Example: TypeScript wallet

[`examples/typescript-wallet`](./examples/typescript-wallet) is a richer reference app on top of the same stack (`@deroll/cmio` + this package): portal address book, L2 transfer / withdraw vouchers, and an end-to-end emergency-withdrawal path (including `EtherWithdrawalOutputBuilder`).

Prefer the **templates** for greenfield apps; use the **wallet example** when you need the fuller feature set.

## Language choice

| Layer | Language |
| --- | --- |
| Public API | **TypeScript** |
| Native bridge | C++ (N-API) |
| Ledger core (production) | C++ libcma (`machine-asset-tools`) |

## Backends

| Backend | When | Proof-identical? |
| --- | --- | --- |
| `memory` | Default host fallback / `{ backend: "memory" }` | **No** — tests & local only |
| `native-mock` | Host after `npm run build:native` | **No** — API smoke tests |
| `native-libcma` | riscv64 (or `LIBCMA_FORCE_REAL=1`) + `libcma.a` | **Yes** — required for emergency withdrawal |

### Real libcma on riscv64

Same recipe as the Rust binding (`build.rs`). Requires the git submodules under `deps/` (`--recurse-submodules` on clone).

```sh
# 1) Build static archive (cross on x86/arm, or native on riscv64)
npm run build:libcma:riscv64

# 2) Inside a riscv64 Node environment, build the addon against it
npm run build:native:riscv64
```

Docker example (Apple Silicon / amd64 host):

```sh
docker run --rm --platform linux/riscv64 \
  -v "$PWD":/work -w /work cartesi/node:22.14.0-noble \
  bash -lc 'apt-get update -qq && apt-get install -y -qq build-essential python3 make g++ wget \
    && npm ci && npm run build:native:riscv64'
```

On install inside the Cartesi machine / riscv64 image, `scripts/install-native.mjs` detects `process.arch === "riscv64"`, builds `libcma.a` if missing, and links the real backend (`kind === "native-libcma"`).

Machine usage (match `log2_max_num_of_accounts = 12` → 4096 slots in a 4 MiB drive):

```ts
import {
  Ledger,
  ACCOUNTS_DRIVE_PATH,
  ACCOUNTS_DRIVE_SIZE_4MIB,
} from "@riseandshaheen/libcma";

const ledger = Ledger.openEtherFile(
  ACCOUNTS_DRIVE_PATH,
  { maxAccounts: 4096, memoryLength: ACCOUNTS_DRIVE_SIZE_4MIB },
  { backend: "native" },
);
```

Uses `cma_ledger_init_single_file` with `ASSET_TYPE_BASE` (Ether) — the compact 32-byte account layout expected by contracts v3 withdrawal config.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript → `lib/` |
| `npm test` | Build + run Ether unit tests |
| `npm run build:native` | Compile N-API addon (host mock on non-riscv64) |
| `npm run build:libcma:riscv64` | Cross/native build `deps/.../build/riscv64/libcma.a` |
| `npm run build:native:riscv64` | Build addon linked to real libcma (riscv64 / `LIBCMA_FORCE_REAL`) |
| `LIBCMA_SKIP_NATIVE=1 npm install` | Skip native compile on install |

## Phase 1 scope

- Ether deposit / transfer / withdraw (debit) / balance
- Portal deposit helper `creditEtherDeposit` / `parseEtherPortalDeposit`
- Host tests without a Cartesi Machine
- Native addon: host mock + **real libcma path for riscv64**
- JS/TS app templates + wallet example (accounts drive + EW-ready `cartesi.toml`)

**Not yet:** ERC-20/721/1155 multi-asset ledger, parser/voucher encode, published riscv64 prebuilds on npm.
