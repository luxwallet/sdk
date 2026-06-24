import { describe, expect, it } from "vitest";
import { buildZchainUnsignedTx } from "./zchain.js";
import { buildXvmUnsignedTx } from "./xvm.js";
import { sha256 } from "./hash.js";

const NETWORK_ID = 369;
const BLOCKCHAIN = "0504030201" + "0".repeat(54);
const ASSET = "010203" + "0".repeat(58);
const ADDR = "fceda8f90fcb5d30614b99d79fc4baa293077626";
const TXID = "fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0";

const out0 = { assetId: ASSET, amount: "12345", threshold: 1, addresses: [ADDR] };
const input = { txId: TXID, outputIndex: 1, assetId: ASSET, amount: "54321", sigIndices: [2] };

const intent = {
  networkId: NETWORK_ID,
  blockchainId: BLOCKCHAIN,
  inputs: [input],
  outputs: [out0],
  memo: "00010203",
};

describe("@luxwallet/tx Lux Z-Chain builder (transparent core, real)", () => {
  it("produces the canonical UTXO BaseTx encoding; digest = sha256(bytes)", () => {
    const tx = buildZchainUnsignedTx(intent);
    expect(tx.family).toBe("lux-z");
    expect(tx.serialized).toMatch(/^0x[0-9a-f]+$/);
    const bytes = Uint8Array.from(tx.serialized.slice(2).match(/../g)!.map((h) => parseInt(h, 16)));
    let want = "0x";
    for (const b of sha256(bytes)) want += b.toString(16).padStart(2, "0");
    expect(tx.digest).toBe(want);
  });

  it("the transparent transfer IS the verified X-Chain BaseTx encoding (byte-identical)", () => {
    // The Z-Chain transparent transfer reuses the secp256k1fx UTXO BaseTx
    // wire format. Asserting byte-equality with buildXvmUnsignedTx (which
    // is KAT-verified against the Go SDK) transitively verifies this core
    // encoding against the canonical Lux wire format.
    const z = buildZchainUnsignedTx(intent);
    const x = buildXvmUnsignedTx({ kind: "base", ...intent });
    expect(z.serialized).toBe(x.serialized);
  });

  it("round-trips: the BaseTx bytes decode to the inputs/outputs/memo", () => {
    const tx = buildZchainUnsignedTx(intent);
    const b = Uint8Array.from(tx.serialized.slice(2).match(/../g)!.map((h) => parseInt(h, 16)));
    const dv = new DataView(b.buffer);
    let o = 0;
    const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
    const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
    const u64 = () => { const v = dv.getBigUint64(o, true); o += 8; return v; };
    const skip = (n: number) => { o += n; };

    expect(u16()).toBe(0); // codec version
    expect(u32()).toBe(0); // BaseTx type-id
    expect(u32()).toBe(NETWORK_ID); // networkID
    skip(32); // blockchainID
    expect(u32()).toBe(1); // nOuts
    skip(32); // assetID
    expect(u32()).toBe(7); // output type-id (TransferOutput)
    expect(u64()).toBe(12345n); // amount
    skip(8); // locktime
    expect(u32()).toBe(1); // threshold
    expect(u32()).toBe(1); // nAddrs
    skip(20); // addr
    expect(u32()).toBe(1); // nIns
    skip(32); // input txid
    expect(u32()).toBe(1); // outputIndex
    skip(32); // input assetID
    expect(u32()).toBe(5); // input type-id (TransferInput)
    expect(u64()).toBe(54321n); // input amount
    expect(u32()).toBe(1); // nSigIndices
    expect(u32()).toBe(2); // sigIndex
    expect(u32()).toBe(4); // memo length
    expect([b[o], b[o + 1], b[o + 2], b[o + 3]]).toEqual([0, 1, 2, 3]); // memo
  });

  it("rejects empty inputs/outputs", () => {
    expect(() => buildZchainUnsignedTx({ ...intent, inputs: [] })).toThrow(/>= 1 input/);
    expect(() => buildZchainUnsignedTx({ ...intent, outputs: [] })).toThrow(/>= 1 output/);
  });
});
