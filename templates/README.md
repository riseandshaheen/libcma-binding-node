# libcma application templates

Boilerplates for new Cartesi Rollups v2 applications with a libcma Ether
ledger on the accounts drive (`/dev/pmem1`), analogous to the
`cartesi create --template javascript|typescript` scaffolds.

| Template | Entry point | Build step |
| --- | --- | --- |
| [`javascript/`](javascript) | `src/index.js` | none (plain ESM) |
| [`typescript/`](typescript) | `src/index.ts` | `tsc` + esbuild bundle |

Both wire up:

- EtherPortal deposit crediting via `ledger.creditEtherDeposit`
- `inspect balance/<address>` route
- accounts-drive flush (`sync`) before every yield
- `cartesi.toml` with the accounts drive and a `[withdrawal.config]` matching
  4096 × 32-byte Ether leaves (emergency-withdrawal ready)

Add your logic in `handleInput` / `handleQuery`. See each template's README
for host tests, `cartesi build`, and the emergency-withdrawal notes.

Templates resolve `@riseandshaheen/libcma` as `file:../..`; to use one
outside this repository, copy the directory and change the dependency to the
published package (or vendor the binding and keep the `file:` path).
