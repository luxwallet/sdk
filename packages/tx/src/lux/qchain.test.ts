import { describe, expect, it } from "vitest";
import { keccak256, parseTransaction } from "viem";
import { buildQchainUnsignedTx } from "./qchain.js";
import { buildEvmUnsignedTx } from "../evm.js";

// Lux Q-Chain EVM id (sovereign-L1 sequence: C=96369, DEX=96370, Q=96371).
const Q_CHAIN_ID = 96371;

const intent = {
  chainId: Q_CHAIN_ID,
  to: "0x2222222222222222222222222222222222222222" as const,
  value: "500000000000000000", // 0.5 LUX
  nonce: 11,
  gas: "21000",
  maxFeePerGas: "40000000000",
  maxPriorityFeePerGas: "2000000000",
};

describe("@luxwallet/tx Lux Q-Chain builder (PQ-EVM, real)", () => {
  it("produces an unsigned EIP-1559 typed-tx (0x02) and a keccak256 digest", () => {
    const tx = buildQchainUnsignedTx(intent);
    expect(tx.family).toBe("lux-q");
    expect(tx.serialized.startsWith("0x02")).toBe(true);
    // The digest is keccak256 of the serialized bytes (what ML-DSA signs).
    expect(tx.digest).toBe(keccak256(tx.serialized));
    expect(tx.summary.signatureScheme).toContain("ML-DSA");
  });

  it("round-trips through viem with every field intact (complete tx)", () => {
    const tx = buildQchainUnsignedTx(intent);
    const parsed = parseTransaction(tx.serialized);
    expect(parsed.chainId).toBe(Q_CHAIN_ID);
    expect(parsed.nonce).toBe(11);
    expect(parsed.to?.toLowerCase()).toBe(intent.to);
    expect(parsed.value).toBe(500000000000000000n);
    expect(parsed.gas).toBe(21000n);
    expect(parsed.maxFeePerGas).toBe(40000000000n);
    expect(parsed.maxPriorityFeePerGas).toBe(2000000000n);
  });

  it("is unsigned (no signature fields after serialization)", () => {
    const parsed = parseTransaction(buildQchainUnsignedTx(intent).serialized);
    expect(parsed.v).toBeUndefined();
    expect(parsed.r).toBeUndefined();
    expect(parsed.s).toBeUndefined();
  });

  it("the unsigned encoding IS the canonical EVM encoding (same bytes as buildEvmUnsignedTx at the same id)", () => {
    // Prove the Q-Chain unsigned tx is byte-identical to a normal EVM tx —
    // PQ only changes the signature, never the unsigned bytes. Use C-Chain
    // (96369, a registered EVM chain) to drive buildEvmUnsignedTx, then
    // build the Q-Chain tx at the SAME id and assert equal serialization.
    const evm = buildEvmUnsignedTx({ ...intent, chainId: 96369 });
    const q = buildQchainUnsignedTx({ ...intent, chainId: 96369 });
    expect(q.serialized).toBe(evm.serialized);
  });

  it("rejects a non-positive chain id", () => {
    expect(() => buildQchainUnsignedTx({ ...intent, chainId: 0 })).toThrow(/chainId/);
  });
});
