/** libcma-style error codes (see `include/libcma/ledger.h`). */
export const LedgerErrorCode = {
  SUCCESS: 0,
  UNKNOWN: -1001,
  EXCEPTION: -1002,
  INSUFFICIENT_FUNDS: -1003,
  ACCOUNT_NOT_FOUND: -1004,
  ASSET_NOT_FOUND: -1005,
  BALANCE_NOT_FOUND: -1006,
  SUPPLY_OVERFLOW: -1007,
  BALANCE_OVERFLOW: -1008,
  INVALID_ACCOUNT: -1009,
  INSERTION_ERROR: -1010,
  MAX_ASSETS_REACHED: -1011,
  MAX_ACCOUNTS_REACHED: -1012,
  MAX_BALANCES_REACHED: -1013,
  ASSET_SUPPLY: -1014,
  ACCOUNT_BALANCE: -1015,
  REMOVE: -1016,
} as const;

export type LedgerErrorCodeValue =
  (typeof LedgerErrorCode)[keyof typeof LedgerErrorCode];

const CODE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(LedgerErrorCode).map(([k, v]) => [v, k]),
);

export class LedgerError extends Error {
  readonly name = "LedgerError";
  readonly code: number;

  constructor(code: number, message?: string) {
    const label = CODE_NAMES[code] ?? "UNKNOWN";
    super(message ?? `libcma ledger error ${label} (${code})`);
    this.code = code;
  }

  static fromCode(code: number, detail?: string): LedgerError {
    return new LedgerError(code, detail);
  }
}
