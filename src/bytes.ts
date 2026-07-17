import { ADDRESS_LENGTH, type Address, type BytesLike, type Hex } from "./types.js";
import { LedgerError, LedgerErrorCode } from "./errors.js";

const HEX_RE = /^0x[0-9a-fA-F]*$/;

export function isHex(value: string): value is Hex {
  return HEX_RE.test(value) && value.length % 2 === 0;
}

export function toBytes(value: BytesLike, name = "value"): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value !== "string" || !isHex(value)) {
    throw new TypeError(`${name} must be a 0x-hex string or Uint8Array`);
  }
  const hex = value.slice(2);
  if (hex.length % 2 !== 0) {
    throw new TypeError(`${name} hex length must be even`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function toHex(bytes: Uint8Array): Hex {
  let s = "0x";
  for (const b of bytes) {
    s += b.toString(16).padStart(2, "0");
  }
  return s as Hex;
}

/** Normalize to lowercase 0x-address (20 bytes). */
export function normalizeAddress(address: BytesLike): Address {
  const bytes = toBytes(address, "address");
  if (bytes.length !== ADDRESS_LENGTH) {
    throw new TypeError(
      `address must be ${ADDRESS_LENGTH} bytes, got ${bytes.length}`,
    );
  }
  return toHex(bytes).toLowerCase() as Address;
}

export function assertAmount(amount: bigint, name = "amount"): void {
  if (typeof amount !== "bigint") {
    throw new TypeError(`${name} must be a bigint`);
  }
  if (amount < 0n) {
    throw new RangeError(`${name} must be non-negative`);
  }
}

/**
 * Decode packed EtherPortal deposit payload (Rollups v2):
 * `sender (20) || value (32) || execLayerData?`
 */
export function parseEtherPortalDeposit(payload: BytesLike): {
  sender: Address;
  value: bigint;
  execLayerData?: Hex;
} {
  const bytes = toBytes(payload, "payload");
  if (bytes.length < ADDRESS_LENGTH + 32) {
    throw LedgerError.fromCode(
      LedgerErrorCode.UNKNOWN,
      `ether deposit payload too short: ${bytes.length} bytes`,
    );
  }
  const sender = normalizeAddress(bytes.subarray(0, ADDRESS_LENGTH));
  let value = 0n;
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[ADDRESS_LENGTH + i]!);
  }
  const rest = bytes.subarray(ADDRESS_LENGTH + 32);
  if (rest.length === 0) {
    return { sender, value };
  }
  return { sender, value, execLayerData: toHex(rest) };
}
