/**
 * Cartesi Rollups TypeScript template — libcma Ether ledger boilerplate.
 *
 * Rollup I/O: native libcmt via @deroll/cmio (no HTTP /finish server).
 * Ledger:     @riseandshaheen/libcma on /dev/pmem1 (emergency-withdrawal ready).
 *
 * Out of the box:
 *   - EtherPortal deposits are credited to the sender on the accounts drive
 *   - `inspect balance/<address>` returns the wei balance
 *   - Everything else lands in `handleInput` / `handleQuery` — add your code there
 */
import { execFileSync } from "node:child_process";
import {
  type AdvanceRequest,
  type InspectRequest,
  Rollup,
} from "@deroll/cmio";
import {
  ACCOUNTS_DRIVE_PATH,
  ACCOUNTS_DRIVE_SIZE_4MIB,
  Ledger,
  type Address,
} from "@riseandshaheen/libcma";
import { getAddress, stringToHex } from "viem";

/** Devnet EtherPortal; override per network via env. */
const ETHER_PORTAL = getAddress(
  process.env.ETHER_PORTAL_ADDRESS ??
    "0x8b53327575ac999bdfa8003f4b5134DFF9027516",
);

const maxAccounts = Number(process.env.LIBCMA_MAX_ACCOUNTS ?? 4096);
const memoryLength = Number(
  process.env.LIBCMA_MEMORY_LENGTH ?? ACCOUNTS_DRIVE_SIZE_4MIB,
);
const accountsPath = process.env.LIBCMA_ACCOUNTS_PATH ?? ACCOUNTS_DRIVE_PATH;

/**
 * Inside the Cartesi Machine prefer the accounts drive (native backend).
 * On the host (tsx / unit tests) fall back to an in-memory buffer.
 */
function openLedger(): Ledger {
  if (process.env.LIBCMA_BACKEND === "memory") {
    return Ledger.openEtherBuffer(
      { maxAccounts, memoryLength },
      { backend: "memory" },
    );
  }
  try {
    return Ledger.openEtherFile(
      accountsPath,
      { maxAccounts, memoryLength, offset: 0 },
      { backend: process.env.LIBCMA_BACKEND === "native" ? "native" : "auto" },
    );
  } catch (error) {
    console.warn(
      `[app] openEtherFile(${accountsPath}) failed (${String(error)}); using buffer backend`,
    );
    return Ledger.openEtherBuffer({ maxAccounts, memoryLength });
  }
}

const ledger = openLedger();
console.log(`[app] ledger backend=${ledger.backendKind} path=${accountsPath}`);

/**
 * Flush libcma mmap dirty pages to /dev/pmem1 before yielding.
 * Without this, machine snapshots (and emergency-withdrawal Merkle roots)
 * can miss recent ledger writes on non-DAX Cartesi pmem.
 */
function flushAccountsDrive(): void {
  try {
    execFileSync("sync", { stdio: "ignore" });
  } catch {
    // Host / slim images may lack `sync`; machine image has busybox sync.
  }
}

function report(rollup: Rollup, value: unknown): void {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  rollup.emitReport(stringToHex(text));
}

// ---------------------------------------------------------------------------
// TODO: your application logic
// ---------------------------------------------------------------------------

/**
 * Handle a non-deposit advance input. `sender` is the L1 msg.sender and
 * `payload` is the raw input bytes. Return true to accept, false to reject.
 *
 * The ledger is available for balance changes, e.g.:
 *   ledger.transferEther(sender, to, amount);
 *   ledger.withdrawEther(sender, amount);   // then rollup.emitVoucher(...)
 */
function handleInput(
  rollup: Rollup,
  sender: Address,
  payload: Buffer,
): boolean {
  report(rollup, { echo: payload.toString("utf8"), sender });
  return true;
}

/** Handle a non-balance inspect query (raw payload string). */
function handleQuery(rollup: Rollup, query: string): void {
  report(rollup, `unknown inspect route: ${query}`);
}

// ---------------------------------------------------------------------------
// Rollup loop (deposits + balance inspect are wired for you)
// ---------------------------------------------------------------------------

function handleAdvance(request: AdvanceRequest, rollup: Rollup): boolean {
  try {
    const sender = getAddress(request.msgSender) as Address;

    if (sender === ETHER_PORTAL) {
      const { sender: depositor, value } = ledger.creditEtherDeposit(
        request.payload,
      );
      console.log(`[app] deposit ${value} wei from ${depositor}`);
      report(rollup, {
        event: "deposit",
        sender: depositor,
        value: value.toString(),
      });
      return true;
    }

    return handleInput(rollup, sender, request.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[app] advance failed: ${message}`);
    report(rollup, `advance error: ${message}`);
    return false;
  }
}

function handleInspect(request: InspectRequest, rollup: Rollup): void {
  try {
    const query = request.payload.toString("utf8");
    const [route, arg] = query.split("/");

    if (route === "balance" && arg) {
      const balance = ledger.getEtherBalance(getAddress(arg) as Address);
      report(rollup, balance.toString());
      return;
    }

    handleQuery(rollup, query);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report(rollup, `inspect error: ${message}`);
  }
}

async function main(): Promise<void> {
  const rollup = new Rollup();
  console.log("[app] cmio rollup device open");

  await rollup.run({
    advance(request, r) {
      const ok = handleAdvance(request, r);
      flushAccountsDrive();
      return ok;
    },
    inspect(request, r) {
      handleInspect(request, r);
      flushAccountsDrive();
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
