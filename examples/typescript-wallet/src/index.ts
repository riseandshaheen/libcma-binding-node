/**
 * Cartesi Rollups TypeScript template — Ether wallet backed by libcma + @deroll/cmio.
 *
 * Rollup I/O: native libcmt via @deroll/cmio (no HTTP /finish server).
 * Ledger:     @riseandshaheen/libcma on /dev/pmem1 (emergency-withdrawal ready).
 *
 * Advance:
 *   - EtherPortal deposit → ledger.creditEtherDeposit
 *   - Other portals (ERC-20/721/1155) are recognized by address but rejected:
 *     this template opens a single-asset Ether ledger only
 *   - JSON `{"action":"eth.withdraw","amount":"<wei>"}` → debit + voucher
 *   - JSON `{"action":"eth.transfer","to":"0x…","amount":"<wei>"}` → L2 transfer
 *
 * Inspect:
 *   - `balance/<address>` → wei string
 *   - `health` → backend kind + drive path + portal book
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
  LedgerError,
  type Address,
} from "@riseandshaheen/libcma";
import { getAddress, stringToHex } from "viem";
import {
  loadPortalAddresses,
  matchPortal,
  type PortalKind,
} from "./portals.js";

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

const portals = loadPortalAddresses();

const maxAccounts = Number(process.env.LIBCMA_MAX_ACCOUNTS ?? 4096);
const memoryLength = Number(
  process.env.LIBCMA_MEMORY_LENGTH ?? ACCOUNTS_DRIVE_SIZE_4MIB,
);
const accountsPath = process.env.LIBCMA_ACCOUNTS_PATH ?? ACCOUNTS_DRIVE_PATH;

/**
 * Inside the Cartesi Machine prefer the accounts drive.
 * On the host (tsx / unit tests) fall back to an in-memory / mock buffer.
 */
function openLedger(): Ledger {
  const preferNative = process.env.LIBCMA_BACKEND === "native";
  const preferMemory = process.env.LIBCMA_BACKEND === "memory";

  if (preferMemory) {
    return Ledger.openEtherBuffer(
      { maxAccounts, memoryLength },
      { backend: "memory" },
    );
  }

  try {
    return Ledger.openEtherFile(
      accountsPath,
      { maxAccounts, memoryLength, offset: 0 },
      { backend: preferNative ? "native" : "auto" },
    );
  } catch (error) {
    console.warn(
      `[wallet] openEtherFile(${accountsPath}) failed (${String(error)}); using buffer backend`,
    );
    return Ledger.openEtherBuffer(
      { maxAccounts, memoryLength },
      { backend: preferNative ? "native" : "auto" },
    );
  }
}

const ledger = openLedger();
console.log(
  `[wallet] ledger backend=${ledger.backendKind} path=${accountsPath}`,
);
console.log(
  `[wallet] portals ether=${portals.ether} erc20=${portals.erc20} erc721=${portals.erc721} erc1155Single=${portals.erc1155Single} erc1155Batch=${portals.erc1155Batch}`,
);

function errorMessage(error: unknown): string {
  if (error instanceof LedgerError) {
    return `${error.message} (code=${error.code})`;
  }
  return error instanceof Error ? error.message : String(error);
}

function reportJson(rollup: Rollup, value: unknown): void {
  rollup.emitReport(stringToHex(JSON.stringify(value)));
}

function reportText(rollup: Rollup, text: string): void {
  rollup.emitReport(stringToHex(text));
}

function handleEtherDeposit(rollup: Rollup, payload: Buffer): boolean {
  try {
    const { sender, value } = ledger.creditEtherDeposit(payload);
    console.log(`[wallet] deposit ${value} wei from ${sender}`);
    reportJson(rollup, {
      event: "deposit",
      portal: "ether",
      sender,
      value: value.toString(),
    });
    return true;
  } catch (error) {
    console.error(`[wallet] deposit failed: ${errorMessage(error)}`);
    reportText(rollup, `deposit error: ${errorMessage(error)}`);
    return false;
  }
}

/**
 * Token portals are in the address book so we never treat them as user JSON,
 * but this template's libcma backend is Ether-only (`openEther*`).
 */
function handleUnsupportedPortalDeposit(
  rollup: Rollup,
  portal: Exclude<PortalKind, "ether">,
): boolean {
  const message =
    `${portal} deposits are not supported by this Ether-only ledger; ` +
    "use a multi-asset libcma init to credit ERC-20/721/1155";
  console.warn(`[wallet] ${message}`);
  reportJson(rollup, {
    event: "deposit_rejected",
    portal,
    reason: "ether-only-ledger",
    message,
  });
  return false;
}

type WalletAction =
  | { action: "eth.withdraw"; amount: string }
  | { action: "eth.transfer"; to: string; amount: string };

function handleUserAction(
  rollup: Rollup,
  sender: Address,
  input: WalletAction,
): boolean {
  switch (input.action) {
    case "eth.withdraw": {
      const amount = BigInt(input.amount);
      ledger.withdrawEther(sender, amount);
      rollup.emitVoucher({
        destination: sender,
        value: amount,
        payload: "0x",
      });
      console.log(`[wallet] withdraw ${amount} wei → voucher for ${sender}`);
      return true;
    }
    case "eth.transfer": {
      const to = getAddress(input.to) as Address;
      const amount = BigInt(input.amount);
      ledger.transferEther(sender, to, amount);
      reportJson(rollup, {
        event: "transfer",
        from: sender,
        to,
        amount: amount.toString(),
      });
      return true;
    }
    default:
      reportText(rollup, "unknown action");
      return false;
  }
}

function handleAdvance(request: AdvanceRequest, rollup: Rollup): boolean {
  try {
    const sender = getAddress(request.msgSender);
    const portal = matchPortal(portals, sender);

    if (portal === "ether") {
      return handleEtherDeposit(rollup, request.payload);
    }
    if (portal !== undefined) {
      return handleUnsupportedPortalDeposit(rollup, portal);
    }

    const raw = request.payload.toString("utf8");
    const input = JSON.parse(raw) as WalletAction;
    return handleUserAction(rollup, sender as Address, input);
  } catch (error) {
    console.error(`[wallet] advance failed: ${errorMessage(error)}`);
    reportText(rollup, `advance error: ${errorMessage(error)}`);
    return false;
  }
}

function handleInspect(request: InspectRequest, rollup: Rollup): void {
  try {
    const query = request.payload.toString("utf8");
    const parts = query.split("/");

    switch (parts[0]) {
      case "balance": {
        const address = getAddress(parts[1]!) as Address;
        const balance = ledger.getEtherBalance(address);
        reportText(rollup, balance.toString());
        break;
      }
      case "health": {
        reportJson(rollup, {
          ok: true,
          backend: ledger.backendKind,
          accountsPath,
          maxAccounts,
          io: "cmio",
          ledger: "ether-only",
          portals,
        });
        break;
      }
      default:
        reportText(rollup, `unknown inspect route: ${query}`);
    }
  } catch (error) {
    reportText(rollup, `inspect error: ${errorMessage(error)}`);
  }
}

async function main(): Promise<void> {
  const rollup = new Rollup();
  console.log("[wallet] cmio rollup device open");

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
