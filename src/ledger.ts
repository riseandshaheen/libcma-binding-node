import type { Address, BackendKind, LedgerBufferConfig, LedgerEtherConfig, LedgerFileConfig } from "./types.js";
import {
  ACCOUNTS_DRIVE_PATH,
  ACCOUNTS_DRIVE_SIZE_4MIB,
  DEFAULT_ETHER_CONFIG,
  LOG2_MAX_NUM_OF_ACCOUNTS_DEFAULT,
} from "./types.js";
import { LedgerError, LedgerErrorCode } from "./errors.js";
import { assertAmount, normalizeAddress, parseEtherPortalDeposit } from "./bytes.js";
import { MemoryBackend, type LedgerBackend } from "./memory-backend.js";
import { NativeBackend, isNativeAvailable } from "./native-backend.js";

export type OpenLedgerOptions = {
  /**
   * Prefer native addon when available.
   * - `"auto"` (default): native if built, else memory backend
   * - `"memory"`: force host memory backend (never proof-identical)
   * - `"native"`: require native addon or throw
   */
  backend?: "auto" | "memory" | "native";
};

/**
 * Proveable-oriented asset ledger (Ether MVP).
 *
 * On the Cartesi Machine, open the accounts drive via {@link Ledger.openEtherFile}
 * with path {@link ACCOUNTS_DRIVE_PATH}. On the host, {@link Ledger.openEtherBuffer}
 * uses the native mock when built, otherwise the TypeScript memory backend.
 */
export class Ledger {
  #backend: LedgerBackend;

  private constructor(backend: LedgerBackend) {
    this.#backend = backend;
  }

  /** Which implementation is serving this instance. */
  get backendKind(): BackendKind {
    return this.#backend.kind;
  }

  /**
   * Open a single-asset Ether ledger over an in-memory buffer (host tests).
   */
  static openEtherBuffer(
    config: LedgerEtherConfig = DEFAULT_ETHER_CONFIG,
    options: OpenLedgerOptions = {},
  ): Ledger {
    const maxAccounts = config.maxAccounts;
    if (maxAccounts <= 0) {
      throw new RangeError("maxAccounts must be positive");
    }
    return Ledger.#openEther(maxAccounts, options, () =>
      NativeBackend.openEtherBuffer(maxAccounts),
    );
  }

  /**
   * Open a multi-asset buffer ledger; Phase 1 only exposes Ether helpers on top.
   */
  static openBuffer(
    config: LedgerBufferConfig,
    options: OpenLedgerOptions = {},
  ): Ledger {
    return Ledger.openEtherBuffer(
      {
        memoryLength: config.memoryLength,
        maxAccounts: config.maxAccounts,
      },
      options,
    );
  }

  /**
   * Open a single-asset Ether ledger on a file or block device.
   * Inside the machine use {@link ACCOUNTS_DRIVE_PATH} (`/dev/pmem1`).
   */
  static openEtherFile(
    path: string,
    config: LedgerEtherConfig & { offset?: number; memoryLength?: number } = DEFAULT_ETHER_CONFIG,
    options: OpenLedgerOptions = {},
  ): Ledger {
    const maxAccounts = config.maxAccounts;
    const offset = config.offset ?? 0;
    const memoryLength = config.memoryLength ?? ACCOUNTS_DRIVE_SIZE_4MIB;
    if (maxAccounts <= 0) {
      throw new RangeError("maxAccounts must be positive");
    }

    const prefer = options.backend ?? "auto";
    if (prefer === "memory") {
      // Memory backend cannot mmap a drive — still useful for API dry-runs.
      return new Ledger(MemoryBackend.openEther(maxAccounts));
    }

    const native = NativeBackend.openEtherFile(
      path,
      offset,
      memoryLength,
      maxAccounts,
    );
    if (native) {
      return new Ledger(native);
    }
    if (prefer === "native") {
      throw LedgerError.fromCode(
        LedgerErrorCode.UNKNOWN,
        "native libcma addon is not available; run npm run build:native",
      );
    }
    // Host fallback: memory (not drive-backed).
    return new Ledger(MemoryBackend.openEther(maxAccounts));
  }

  /**
   * File-backed multi-asset entry; Phase 1 routes to Ether single-asset helpers.
   */
  static openFile(
    path: string,
    config: LedgerFileConfig,
    options: OpenLedgerOptions = {},
  ): Ledger {
    return Ledger.openEtherFile(
      path,
      {
        maxAccounts: config.maxAccounts,
        offset: config.offset,
        memoryLength: config.memoryLength,
      },
      options,
    );
  }

  static #openEther(
    maxAccounts: number,
    options: OpenLedgerOptions,
    openNative: () => NativeBackend | null,
  ): Ledger {
    const prefer = options.backend ?? "auto";
    if (prefer === "memory") {
      return new Ledger(MemoryBackend.openEther(maxAccounts));
    }
    const native = openNative();
    if (native) {
      return new Ledger(native);
    }
    if (prefer === "native") {
      throw LedgerError.fromCode(
        LedgerErrorCode.UNKNOWN,
        "native libcma addon is not available; run npm run build:native",
      );
    }
    return new Ledger(MemoryBackend.openEther(maxAccounts));
  }

  depositEther(account: Address, amount: bigint): void {
    this.#backend.depositEther(normalizeAddress(account), amount);
  }

  /**
   * Credit from a packed EtherPortal advance payload.
   * @returns decoded sender and value (exec layer data is ignored here)
   */
  creditEtherDeposit(payload: `0x${string}` | Uint8Array): {
    sender: Address;
    value: bigint;
  } {
    const { sender, value } = parseEtherPortalDeposit(payload);
    this.depositEther(sender, value);
    return { sender, value };
  }

  transferEther(from: Address, to: Address, amount: bigint): void {
    this.#backend.transferEther(
      normalizeAddress(from),
      normalizeAddress(to),
      amount,
    );
  }

  /**
   * Debit Ether. Does **not** emit a rollup voucher — the dApp must call
   * `POST /voucher` or `@deroll/cmio.emitVoucher` separately.
   */
  withdrawEther(account: Address, amount: bigint): void {
    assertAmount(amount);
    this.#backend.withdrawEther(normalizeAddress(account), amount);
  }

  getEtherBalance(account: Address): bigint {
    return this.#backend.getEtherBalance(normalizeAddress(account));
  }

  /** Alias matching Deroll naming. */
  getBalance(account: Address): bigint {
    return this.getEtherBalance(account);
  }

  close(): void {
    this.#backend.close();
  }
}

export {
  ACCOUNTS_DRIVE_PATH,
  ACCOUNTS_DRIVE_SIZE_4MIB,
  DEFAULT_ETHER_CONFIG,
  LOG2_MAX_NUM_OF_ACCOUNTS_DEFAULT,
  isNativeAvailable,
};
