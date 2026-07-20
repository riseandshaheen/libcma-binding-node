# TypeScript libcma Ether wallet (Cartesi Rollups template)

Minimal **TypeScript** Cartesi Rollups v2 dApp that:

1. Talks to the machine via **`@deroll/cmio`** (native libcmt — no HTTP `/finish` server)
2. Stores Ether balances in **`@riseandshaheen/libcma`** on the accounts flash drive

Same split as the Rust CMA wallet demo (`libcmt` for I/O, `libcma` for the ledger).

## Features

| Capability | How |
| --- | --- |
| Rollup I/O | `@deroll/cmio` `Rollup.run({ advance, inspect })` |
| Portal book | Ether + ERC-20/721/1155 single/batch (env or `@cartesi/viem`) |
| Ether deposit | EtherPortal → `ledger.creditEtherDeposit` |
| Token deposits | Recognized by portal address; rejected (Ether-only ledger) |
| L2 transfer | `{"action":"eth.transfer","to":"0x…","amount":"…"}` |
| Withdrawal voucher | `{"action":"eth.withdraw","amount":"…"}` → `emitVoucher` |
| Inspect balance | `balance/<address>` |
| Accounts drive | `/dev/pmem1` via `cartesi.toml` `[drives.accounts]` |

## Host quick start

On the host, `@deroll/cmio` uses libcmt’s **mock** IO (`CMT_INPUTS`). libcma can use the memory backend:

```sh
cd examples/typescript-wallet
npm install
npm test
npm run build

# Optional: drive cmio mock inputs (see @deroll/cmio README)
LIBCMA_BACKEND=memory CMT_INPUTS="0:advance.bin" npm start
```

## Build & run with Cartesi CLI

Requires `@cartesi/cli` ≥ 2.0.0-alpha.35 and cartesi-machine 0.20.x.

```sh
cd examples/typescript-wallet
./scripts/vendor-libcma.sh
cartesi build
cartesi run
```

The image runs `node index.js` directly (CMIO). There is **no** `rollup-init` HTTP sidecar.

After the first build, set withdrawal config from `.cartesi/image/config.json` and uncomment `[withdrawal.config]` in `cartesi.toml`.

## Example inputs

Withdraw (JSON advance payload):

```json
{"action":"eth.withdraw","amount":"1000000000000000000"}
```

Transfer:

```json
{"action":"eth.transfer","to":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","amount":"1000"}
```

Inspect:

```text
balance/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
health
```

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `ETHER_PORTAL_ADDRESS` | `@cartesi/viem` book | Ether portal sender |
| `ERC20_PORTAL_ADDRESS` | `@cartesi/viem` book | ERC-20 portal sender |
| `ERC721_PORTAL_ADDRESS` | `@cartesi/viem` book | ERC-721 portal sender |
| `ERC1155_SINGLE_PORTAL_ADDRESS` | `@cartesi/viem` book | ERC-1155 single portal |
| `ERC1155_BATCH_PORTAL_ADDRESS` | `@cartesi/viem` book | ERC-1155 batch portal |
| `LIBCMA_ACCOUNTS_PATH` | `/dev/pmem1` | Accounts drive |
| `LIBCMA_MAX_ACCOUNTS` | `4096` | Ledger capacity (must fit in drive; Rust demo uses 4096 on 4 MiB) |
| `LIBCMA_MEMORY_LENGTH` | `4194304` | Drive / buffer size |
| `LIBCMA_BACKEND` | `native` in image | `memory` \| `native` \| `auto` |
| `CMT_INPUTS` / `CMT_DEBUG` | (host mock) | `@deroll/cmio` host testing |

## Notes

- esbuild keeps `@deroll/cmio` and `@riseandshaheen/libcma` **external** (native `.node` loaders).
- Single-asset Ether ledger matches `log2_leaves_per_account = 0`.
- Portal addresses mirror the Rust CMA wallet pattern (env overrides + address book); token portal deposits are rejected until the Node binding exposes multi-asset `Ledger` init.
- Aligns with [Rust CMA wallet](https://github.com/Mugen-Builders/CMA-Rust-Wallet-Demo-App): libcmt I/O + libcma ledger.

## Contributing

`package.json` points at the published `@riseandshaheen/libcma` on npm. If
you are developing the binding itself alongside this example, switch to a
local link so your changes are picked up immediately:

```sh
# In package.json, replace the version string:
#   "@riseandshaheen/libcma": "0.1.0-alpha.0"
# with a file reference to the repo root:
#   "@riseandshaheen/libcma": "file:../.."
npm install
```

Remember to revert to the published version before committing.
