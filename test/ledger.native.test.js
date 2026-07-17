import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Ledger, isNativeAvailable } from "../lib/index.js";

const ALICE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("Ledger native-mock backend", () => {
  it("uses native-mock when available", { skip: !isNativeAvailable() }, () => {
    const ledger = Ledger.openEtherBuffer(
      { maxAccounts: 64 },
      { backend: "native" },
    );
    assert.equal(ledger.backendKind, "native-mock");

    ledger.depositEther(ALICE, 500n);
    ledger.transferEther(ALICE, BOB, 120n);
    ledger.withdrawEther(BOB, 20n);

    assert.equal(ledger.getEtherBalance(ALICE), 380n);
    assert.equal(ledger.getEtherBalance(BOB), 100n);
    ledger.close();
  });
});
