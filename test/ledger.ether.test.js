import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  Ledger,
  LedgerError,
  LedgerErrorCode,
  parseEtherPortalDeposit,
  normalizeAddress,
} from "../lib/index.js";

const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";

describe("Ledger memory backend (Ether MVP)", () => {
  it("deposits, transfers, withdraws, and reads balances", () => {
    const ledger = Ledger.openEtherBuffer(
      { maxAccounts: 128 },
      { backend: "memory" },
    );
    assert.equal(ledger.backendKind, "memory");

    ledger.depositEther(ALICE, 1_000_000_000_000_000_000n);
    assert.equal(ledger.getEtherBalance(ALICE), 1_000_000_000_000_000_000n);

    ledger.transferEther(ALICE, BOB, 250_000_000_000_000_000n);
    assert.equal(ledger.getEtherBalance(ALICE), 750_000_000_000_000_000n);
    assert.equal(ledger.getEtherBalance(BOB), 250_000_000_000_000_000n);

    ledger.withdrawEther(BOB, 50_000_000_000_000_000n);
    assert.equal(ledger.getEtherBalance(BOB), 200_000_000_000_000_000n);

    ledger.close();
  });

  it("throws on insufficient funds", () => {
    const ledger = Ledger.openEtherBuffer(
      { maxAccounts: 8 },
      { backend: "memory" },
    );
    ledger.depositEther(ALICE, 10n);
    assert.throws(
      () => ledger.withdrawEther(ALICE, 11n),
      (err) =>
        err instanceof LedgerError &&
        err.code === LedgerErrorCode.INSUFFICIENT_FUNDS,
    );
    ledger.close();
  });

  it("credits packed EtherPortal deposits", () => {
    const ledger = Ledger.openEtherBuffer(
      { maxAccounts: 8 },
      { backend: "memory" },
    );
    // sender (20) || value 1 ETH (32)
    const sender = normalizeAddress(ALICE).slice(2);
    const value = (1n * 10n ** 18n).toString(16).padStart(64, "0");
    const payload = `0x${sender}${value}`;

    const decoded = parseEtherPortalDeposit(payload);
    assert.equal(decoded.sender, ALICE.toLowerCase());
    assert.equal(decoded.value, 10n ** 18n);

    const credited = ledger.creditEtherDeposit(payload);
    assert.equal(credited.sender, ALICE.toLowerCase());
    assert.equal(ledger.getBalance(ALICE), 10n ** 18n);
    ledger.close();
  });

  it("is deterministic for the same sequence", () => {
    const run = () => {
      const ledger = Ledger.openEtherBuffer(
        { maxAccounts: 32 },
        { backend: "memory" },
      );
      ledger.depositEther(ALICE, 100n);
      ledger.depositEther(BOB, 40n);
      ledger.transferEther(ALICE, BOB, 25n);
      ledger.withdrawEther(ALICE, 10n);
      const snapshot = {
        alice: ledger.getEtherBalance(ALICE),
        bob: ledger.getEtherBalance(BOB),
      };
      ledger.close();
      return snapshot;
    };
    assert.deepEqual(run(), run());
    assert.deepEqual(run(), { alice: 65n, bob: 65n });
  });
});
