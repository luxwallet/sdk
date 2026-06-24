import { describe, expect, it } from "vitest";
import { parseTransaction } from "viem";
import {
  BUILDER_STATUS,
  STUB_BUILDER_STATUS,
  buildEvmUnsignedTx,
  buildPlatformUnsignedTx,
  buildUtxoUnsignedTx,
  buildZkUnsignedTx,
} from "./index.js";

describe("@luxwallet/tx EVM builder (real)", () => {
  const intent = {
    chainId: 96369,
    to: "0x1111111111111111111111111111111111111111" as const,
    value: "1000000000000000000", // 1 LUX
    nonce: 7,
    gas: "21000",
    maxFeePerGas: "30000000000",
    maxPriorityFeePerGas: "1000000000",
  };

  it("produces an unsigned EIP-1559 typed-tx (0x02 prefix)", () => {
    const tx = buildEvmUnsignedTx(intent);
    expect(tx.family).toBe("evm");
    expect(tx.serialized.startsWith("0x02")).toBe(true);
  });

  it("round-trips through viem with the intent fields intact", () => {
    const tx = buildEvmUnsignedTx(intent);
    const parsed = parseTransaction(tx.serialized);
    expect(parsed.chainId).toBe(96369);
    expect(parsed.nonce).toBe(7);
    expect(parsed.to?.toLowerCase()).toBe(intent.to);
    expect(parsed.value).toBe(1000000000000000000n);
    expect(parsed.gas).toBe(21000n);
    expect(parsed.maxFeePerGas).toBe(30000000000n);
  });

  it("is unsigned (no signature fields after serialization)", () => {
    const tx = buildEvmUnsignedTx(intent);
    const parsed = parseTransaction(tx.serialized);
    expect(parsed.v).toBeUndefined();
    expect(parsed.r).toBeUndefined();
    expect(parsed.s).toBeUndefined();
  });

  it("carries a confirmation summary", () => {
    const tx = buildEvmUnsignedTx(intent);
    expect(tx.summary.chain).toBe("Lux C-Chain");
    expect(tx.summary.value).toBe("1000000000000000000");
  });

  it("rejects a non-EVM / unknown chain id", () => {
    expect(() => buildEvmUnsignedTx({ ...intent, chainId: 999999 })).toThrow(/not a known EVM chain/);
  });
});

describe("@luxwallet/tx builder status table", () => {
  it("reports honest readiness per chain/family", () => {
    expect(BUILDER_STATUS).toEqual({
      evm: "ready",
      solana: "ready",
      xrp: "ready",
      ton: "ready",
      bitcoin: "ready",
      polkadot: "ready",
      cardano: "ready",
      exchange: "ready",
      platform: "todo",
      utxo: "todo",
      zk: "todo",
    });
  });

  it("marks the remaining Lux-native stub families todo", () => {
    expect(STUB_BUILDER_STATUS).toEqual({
      platform: "todo",
      utxo: "todo",
      zk: "todo",
    });
  });
});

describe("@luxwallet/tx Lux-native builders (stubs)", () => {
  it("throws a clear todo error when invoked", () => {
    expect(() => buildPlatformUnsignedTx({})).toThrow(/builder todo/);
    expect(() => buildUtxoUnsignedTx({})).toThrow(/builder todo/);
    expect(() => buildZkUnsignedTx({})).toThrow(/builder todo/);
  });
});
