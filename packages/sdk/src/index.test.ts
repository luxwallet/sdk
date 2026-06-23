import { describe, expect, it } from "vitest";
import { chains, rpc, crypto, keyring, tx } from "./index.js";

describe("@luxwallet/sdk umbrella", () => {
  it("re-exports chains under a namespace", () => {
    expect(chains.getChain(96369)?.id).toBe("lux-c-mainnet");
  });

  it("re-exports rpc under a namespace", () => {
    expect(rpc.getRpcUrl(96369)).toBe("https://api.hanzo.ai/v1/rpc/96369");
  });

  it("re-exports the crypto facade (unbound) under a namespace", () => {
    expect(crypto.isCryptoAvailable()).toBe(false);
    expect(crypto.Scheme.MLDSA65).toBe(0x42);
  });

  it("re-exports keyring under a namespace", () => {
    expect(new keyring.Keyring().size).toBe(0);
  });

  it("re-exports tx and builds a real EVM unsigned tx", () => {
    const unsigned = tx.buildEvmUnsignedTx({
      chainId: 96369,
      to: "0x1111111111111111111111111111111111111111",
      nonce: 0,
      gas: "21000",
      maxFeePerGas: "1",
      maxPriorityFeePerGas: "1",
    });
    expect(unsigned.serialized.startsWith("0x02")).toBe(true);
  });
});
