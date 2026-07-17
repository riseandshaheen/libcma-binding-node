/** 0x-prefixed hex string. Compatible with viem `Hex` / `Address`. */
export type Hex = `0x${string}`;

/** EVM address as checksummed or lowercase 0x hex. */
export type Address = Hex;

/** Bytes input accepted at API boundaries. */
export type BytesLike = Hex | Uint8Array;

export const ADDRESS_LENGTH = 20;
export const U256_LENGTH = 32;

/** Default accounts-drive path inside the Cartesi Machine. */
export const ACCOUNTS_DRIVE_PATH = "/dev/pmem1";

/**
 * 4 MiB = 2^17 account slots × 32-byte records (contracts v3 convention when
 * `log2_max_num_of_accounts = 17`).
 */
export const ACCOUNTS_DRIVE_SIZE_4MIB = 4_194_304;

export const LOG2_MAX_NUM_OF_ACCOUNTS_DEFAULT = 17;

/** Minimum mem length required by libcma (`CMA_LEDGER_MIN_MEM_LENGTH`). */
export const LEDGER_MIN_MEM_LENGTH = 262_144;

export type LedgerMemoryMode = "create-only" | "open-only";

/**
 * File-backed ledger config (machine: `/dev/pmem1`, or a host test file).
 * Sizes must be consistent with `cartesi.toml` `[withdrawal.config]`.
 */
export type LedgerFileConfig = {
  mode?: LedgerMemoryMode;
  offset?: number;
  memoryLength: number;
  maxAccounts: number;
  maxAssets: number;
  maxBalances: number;
};

/** Buffer-backed (non-persistent) ledger config for host tests. */
export type LedgerBufferConfig = {
  memoryLength?: number;
  maxAccounts: number;
  maxAssets: number;
  maxBalances: number;
};

/**
 * Single-asset Ether ledger config — maps to `cma_ledger_init_single_*`.
 * Preferred for Ether-only dApps.
 */
export type LedgerEtherConfig = {
  memoryLength?: number;
  /** Account capacity; typically `2 ** log2_max_num_of_accounts`. */
  maxAccounts: number;
};

export const DEFAULT_ETHER_CONFIG: Required<LedgerEtherConfig> = {
  memoryLength: ACCOUNTS_DRIVE_SIZE_4MIB,
  maxAccounts: 2 ** LOG2_MAX_NUM_OF_ACCOUNTS_DEFAULT,
};

export type BackendKind = "memory" | "native-mock" | "native-libcma";
