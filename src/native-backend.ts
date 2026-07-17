import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Address } from "./types.js";
import type { LedgerBackend } from "./memory-backend.js";
import { LedgerError, LedgerErrorCode } from "./errors.js";
import { assertAmount, normalizeAddress, toBytes } from "./bytes.js";

type NativeLedgerHandle = {
  depositEther(account: Uint8Array, amount: bigint): void;
  transferEther(from: Uint8Array, to: Uint8Array, amount: bigint): void;
  withdrawEther(account: Uint8Array, amount: bigint): void;
  getEtherBalance(account: Uint8Array): bigint;
  close(): void;
  readonly kind: string;
};

type NativeBinding = {
  openEtherBuffer(maxAccounts: number): NativeLedgerHandle;
  openEtherFile(
    path: string,
    offset: number,
    memoryLength: number,
    maxAccounts: number,
  ): NativeLedgerHandle;
};

let cached: NativeBinding | null | undefined;

function tryLoadNative(): NativeBinding | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    const require = createRequire(import.meta.url);
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const binding = require("node-gyp-build")(root) as NativeBinding;
    cached = binding;
    return binding;
  } catch {
    cached = null;
    return null;
  }
}

export function isNativeAvailable(): boolean {
  return tryLoadNative() !== null;
}

export class NativeBackend implements LedgerBackend {
  readonly kind: "native-mock" | "native-libcma";
  #handle: NativeLedgerHandle;
  #closed = false;

  private constructor(handle: NativeLedgerHandle) {
    this.#handle = handle;
    this.kind =
      handle.kind === "native-libcma" ? "native-libcma" : "native-mock";
  }

  static openEtherBuffer(maxAccounts: number): NativeBackend | null {
    const native = tryLoadNative();
    if (!native) {
      return null;
    }
    return new NativeBackend(native.openEtherBuffer(maxAccounts));
  }

  static openEtherFile(
    path: string,
    offset: number,
    memoryLength: number,
    maxAccounts: number,
  ): NativeBackend | null {
    const native = tryLoadNative();
    if (!native) {
      return null;
    }
    return new NativeBackend(
      native.openEtherFile(path, offset, memoryLength, maxAccounts),
    );
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw LedgerError.fromCode(LedgerErrorCode.UNKNOWN, "ledger is closed");
    }
  }

  #addr(account: Address): Uint8Array {
    return toBytes(normalizeAddress(account));
  }

  depositEther(account: Address, amount: bigint): void {
    this.#ensureOpen();
    assertAmount(amount);
    this.#handle.depositEther(this.#addr(account), amount);
  }

  transferEther(from: Address, to: Address, amount: bigint): void {
    this.#ensureOpen();
    assertAmount(amount);
    this.#handle.transferEther(this.#addr(from), this.#addr(to), amount);
  }

  withdrawEther(account: Address, amount: bigint): void {
    this.#ensureOpen();
    assertAmount(amount);
    this.#handle.withdrawEther(this.#addr(account), amount);
  }

  getEtherBalance(account: Address): bigint {
    this.#ensureOpen();
    return this.#handle.getEtherBalance(this.#addr(account));
  }

  close(): void {
    if (!this.#closed) {
      this.#handle.close();
      this.#closed = true;
    }
  }
}
