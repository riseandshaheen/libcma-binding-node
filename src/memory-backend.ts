import type { Address } from "./types.js";
import { LedgerError, LedgerErrorCode } from "./errors.js";
import { assertAmount, normalizeAddress } from "./bytes.js";

/**
 * Internal ledger operations shared by memory and native backends.
 *
 * Host `MemoryBackend` is **behavioral only** — not proof-identical to C++ libcma.
 * Production / emergency-withdrawal must use the native addon linked to real libcma.
 */
export interface LedgerBackend {
  readonly kind: "memory" | "native-mock" | "native-libcma";
  depositEther(account: Address, amount: bigint): void;
  transferEther(from: Address, to: Address, amount: bigint): void;
  withdrawEther(account: Address, amount: bigint): void;
  getEtherBalance(account: Address): bigint;
  close(): void;
}

/**
 * In-process Ether ledger for host unit tests and local development.
 *
 * NOT suitable for emergency-withdrawal proofs.
 */
export class MemoryBackend implements LedgerBackend {
  readonly kind = "memory" as const;
  #balances = new Map<string, bigint>();
  #closed = false;
  readonly maxAccounts: number;

  constructor(options: { maxAccounts: number }) {
    this.maxAccounts = options.maxAccounts;
  }

  static openEther(maxAccounts: number): MemoryBackend {
    return new MemoryBackend({ maxAccounts });
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw LedgerError.fromCode(
        LedgerErrorCode.UNKNOWN,
        "ledger is closed",
      );
    }
  }

  #get(key: string): bigint {
    return this.#balances.get(key) ?? 0n;
  }

  #set(key: string, value: bigint): void {
    if (value === 0n) {
      this.#balances.delete(key);
    } else {
      this.#balances.set(key, value);
    }
  }

  #ensureCapacityForNew(key: string): void {
    if (!this.#balances.has(key) && this.#balances.size >= this.maxAccounts) {
      throw LedgerError.fromCode(LedgerErrorCode.MAX_ACCOUNTS_REACHED);
    }
  }

  depositEther(account: Address, amount: bigint): void {
    this.#ensureOpen();
    assertAmount(amount);
    if (amount === 0n) {
      return;
    }
    const key = normalizeAddress(account);
    this.#ensureCapacityForNew(key);
    this.#set(key, this.#get(key) + amount);
  }

  transferEther(from: Address, to: Address, amount: bigint): void {
    this.#ensureOpen();
    assertAmount(amount);
    if (amount === 0n) {
      return;
    }
    const fromKey = normalizeAddress(from);
    const toKey = normalizeAddress(to);
    const balance = this.#get(fromKey);
    if (balance < amount) {
      throw LedgerError.fromCode(
        LedgerErrorCode.INSUFFICIENT_FUNDS,
        `insufficient balance of ${fromKey}`,
      );
    }
    if (fromKey !== toKey) {
      this.#ensureCapacityForNew(toKey);
    }
    this.#set(fromKey, balance - amount);
    this.#set(toKey, this.#get(toKey) + amount);
  }

  withdrawEther(account: Address, amount: bigint): void {
    this.#ensureOpen();
    assertAmount(amount);
    if (amount === 0n) {
      return;
    }
    const key = normalizeAddress(account);
    const balance = this.#get(key);
    if (balance < amount) {
      throw LedgerError.fromCode(
        LedgerErrorCode.INSUFFICIENT_FUNDS,
        `insufficient balance of ${key}: ${amount} > ${balance}`,
      );
    }
    this.#set(key, balance - amount);
  }

  getEtherBalance(account: Address): bigint {
    this.#ensureOpen();
    return this.#get(normalizeAddress(account));
  }

  close(): void {
    this.#closed = true;
    this.#balances.clear();
  }
}
