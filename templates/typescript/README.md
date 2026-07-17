# Cartesi TypeScript template with libcma

Boilerplate for a Cartesi Rollups v2 application whose balances live on a
proveable **accounts drive** (`/dev/pmem1`) via
[`@riseandshaheen/libcma`](../../README.md) — ready for contracts v3
**emergency withdrawal**.

Out of the box the app:

- credits EtherPortal deposits to the sender on the accounts drive
- answers `inspect balance/<address>` with the wei balance
- routes everything else to `handleInput` / `handleQuery` in
  [`src/index.ts`](src/index.ts) — add your application logic there

Rollup I/O is native cmio (`@deroll/cmio`); there is no HTTP `/finish` server.

## Host development

```sh
npm install
npm test          # libcma smoke test (memory backend)
npm run build     # tsc typecheck + esbuild bundle → dist/index.js
```

## Build the machine

```sh
./scripts/vendor-libcma.sh    # copy the parent package into vendor/
cartesi build
```

## Run locally

```sh
cartesi run
```

Then deposit and inspect (addresses from `cartesi address-book`):

```sh
cast send <ETHER_PORTAL> "depositEther(address,bytes)" <APP_ADDRESS> 0x \
  --value 0.01ether --private-key <PK> --rpc-url <ANVIL_URL>

curl -sS <PROXY_URL>/inspect/<APP_NAME> \
  --data-binary "balance/<ADDRESS>" -H 'Content-Type: application/octet-stream'
```

## Emergency withdrawal

`cartesi.toml` ships a `[withdrawal.config]` matched to the 4 MiB accounts
drive (4096 × 32-byte Ether leaves). For actual ETH recovery deploy an
`EtherWithdrawalOutputBuilder` and point `withdrawal_output_builder` at it —
see `examples/typescript-wallet/devnet/contracts/` for a working contract and
end-to-end flow.
