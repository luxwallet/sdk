import { describe, expect, it } from "vitest";
import { buildCardanoUnsignedTx } from "./cardano.js";

// A real mainnet bech32 payment address (CIP-19 base address).
const ADDR =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
const TXID = "0".repeat(64); // arbitrary 32-byte funding txid

describe("@luxwallet/tx Cardano builder (real body + hash, partial)", () => {
  const intent = {
    inputs: [{ txid: TXID, index: 0 }],
    outputs: [{ address: ADDR, lovelace: "5000000" }],
    fee: "170000",
    ttl: 50000000,
  };

  it("produces a CBOR body + 32-byte blake2b body hash", async () => {
    const tx = await buildCardanoUnsignedTx(intent);
    expect(tx.family).toBe("cardano");
    expect(tx.serialized).toMatch(/^0x[0-9a-f]+$/);
    // 32-byte hash => 64 hex chars.
    expect(tx.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("round-trips: the CBOR body decodes to the inputs/outputs/fee/ttl", async () => {
    const CSL = await import("@emurgo/cardano-serialization-lib-nodejs");
    const tx = await buildCardanoUnsignedTx(intent);
    const body = CSL.TransactionBody.from_bytes(Buffer.from(tx.serialized.slice(2), "hex"));

    expect(body.inputs().len()).toBe(1);
    expect(body.outputs().len()).toBe(1);
    expect(body.fee().to_str()).toBe("170000");
    expect(body.ttl_bignum()?.to_str()).toBe("50000000");

    const out0 = body.outputs().get(0);
    expect(out0.address().to_bech32()).toBe(ADDR);
    expect(out0.amount().coin().to_str()).toBe("5000000");

    const in0 = body.inputs().get(0);
    expect(Buffer.from(in0.transaction_id().to_bytes()).toString("hex")).toBe(TXID);
    expect(in0.index()).toBe(0);
    body.free();
  });

  it("the digest equals hash(body CBOR) via FixedTransaction", async () => {
    const CSL = await import("@emurgo/cardano-serialization-lib-nodejs");
    const tx = await buildCardanoUnsignedTx(intent);
    const fixed = CSL.FixedTransaction.new_from_body_bytes(
      Buffer.from(tx.serialized.slice(2), "hex"),
    );
    expect(`0x${Buffer.from(fixed.transaction_hash().to_bytes()).toString("hex")}`).toBe(tx.digest);
    fixed.free();
  });

  it("rejects empty inputs/outputs", async () => {
    await expect(buildCardanoUnsignedTx({ ...intent, inputs: [] })).rejects.toThrow(/>= 1 input/);
    await expect(buildCardanoUnsignedTx({ ...intent, outputs: [] })).rejects.toThrow(/>= 1 output/);
  });
});
