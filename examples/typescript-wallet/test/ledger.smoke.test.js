import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

/**
 * Smoke-test the libcma dependency the template wires in.
 * Full rollup loop tests need `cartesi run`.
 */
describe("template libcma dependency", () => {
  it("opens an Ether buffer ledger", async () => {
    const require = createRequire(import.meta.url);
    // Resolve from the example's node_modules after npm install
    const { Ledger } = await import("@riseandshaheen/libcma");
    const ledger = Ledger.openEtherBuffer(
      { maxAccounts: 32 },
      { backend: "memory" },
    );
    const alice = "0x1111111111111111111111111111111111111111";
    ledger.depositEther(alice, 1000n);
    assert.equal(ledger.getEtherBalance(alice), 1000n);
    ledger.close();
    assert.ok(require.resolve("@riseandshaheen/libcma"));
  });
});
