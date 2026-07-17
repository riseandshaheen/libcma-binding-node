import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Smoke-test the libcma dependency the template wires in.
 * Full rollup loop tests need `cartesi run`.
 */
describe("template libcma dependency", () => {
  it("opens an Ether buffer ledger and moves funds", async () => {
    const { Ledger } = await import("@mugen-builders/libcma");
    const ledger = Ledger.openEtherBuffer(
      { maxAccounts: 32 },
      { backend: "memory" },
    );
    const alice = "0x1111111111111111111111111111111111111111";
    const bob = "0x2222222222222222222222222222222222222222";
    ledger.depositEther(alice, 1000n);
    ledger.transferEther(alice, bob, 400n);
    assert.equal(ledger.getEtherBalance(alice), 600n);
    assert.equal(ledger.getEtherBalance(bob), 400n);
    ledger.withdrawEther(bob, 400n);
    assert.equal(ledger.getEtherBalance(bob), 0n);
    ledger.close();
  });
});
