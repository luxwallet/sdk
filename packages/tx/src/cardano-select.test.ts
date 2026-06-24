import { describe, expect, it } from "vitest";
import { selectCardanoInputs } from "./cardano-select.js";
import { buildCardanoUnsignedTx } from "./cardano.js";

// Real mainnet base address (CIP-19) — used as both recipient + change.
const ADDR =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";

// Mainnet protocol params (epoch ~500+).
const PARAMS = { minFeeA: 44, minFeeB: 155381, coinsPerUtxoByte: 4310 };
const TTL = 50_000_000;

const utxo = (txid: string, lovelace: string) => ({ txid, index: 0, lovelace });

describe("@luxwallet/tx selectCardanoInputs (real, WASM)", () => {
  it("selects largest-first, appends change, and the fee is exactly CSL min_fee", async () => {
    const utxos = [
      utxo("0".repeat(64), "3000000"),
      utxo("1".repeat(64), "10000000"),
      utxo("2".repeat(64), "2000000"),
    ];
    const sel = await selectCardanoInputs(utxos, [{ address: ADDR, lovelace: "5000000" }], PARAMS, ADDR, TTL);

    // 10 ADA UTXO alone covers 5 ADA + fee + min-change → one input.
    expect(sel.inputs).toHaveLength(1);
    // Change output appended.
    expect(sel.outputs).toHaveLength(2);
    expect(sel.outputs[1]!.address).toBe(ADDR);
    expect(sel.ttl).toBe(TTL);

    // Conservation: inputs = outputs + fee, exactly.
    const inSum = 10_000_000n;
    const outSum = sel.outputs.reduce((a, o) => a + BigInt(o.lovelace), 0n);
    expect(inSum - outSum).toBe(BigInt(sel.fee));

    // Independently recompute CSL min_fee for the produced body + 1 witness
    // and assert it equals the selector's fee (no overpay, no underpay).
    const CSL = await import("@emurgo/cardano-serialization-lib-nodejs");
    const inputs = CSL.TransactionInputs.new();
    inputs.add(
      CSL.TransactionInput.new(CSL.TransactionHash.from_bytes(Buffer.from(sel.inputs[0]!.txid, "hex")), 0),
    );
    const outs = CSL.TransactionOutputs.new();
    for (const o of sel.outputs) {
      outs.add(
        CSL.TransactionOutput.new(CSL.Address.from_bech32(o.address), CSL.Value.new(CSL.BigNum.from_str(o.lovelace))),
      );
    }
    const body = CSL.TransactionBody.new_tx_body(inputs, outs, CSL.BigNum.from_str(sel.fee));
    body.set_ttl(CSL.BigNum.from_str(String(TTL)));
    const ws = CSL.TransactionWitnessSet.new();
    const vkeys = CSL.Vkeywitnesses.new();
    vkeys.add(
      CSL.Vkeywitness.new(
        CSL.Vkey.new(CSL.PublicKey.from_bytes(new Uint8Array(32))),
        CSL.Ed25519Signature.from_bytes(new Uint8Array(64)),
      ),
    );
    ws.set_vkeys(vkeys);
    const tx = CSL.Transaction.new(body, ws);
    const independentFee = CSL.min_fee(
      tx,
      CSL.LinearFee.new(CSL.BigNum.from_str("44"), CSL.BigNum.from_str("155381")),
    ).to_str();
    expect(sel.fee).toBe(independentFee);
  });

  it("feeds straight into buildCardanoUnsignedTx (end-to-end from a UTXO set)", async () => {
    const utxos = [utxo("a".repeat(64), "20000000")];
    const sel = await selectCardanoInputs(utxos, [{ address: ADDR, lovelace: "8000000" }], PARAMS, ADDR, TTL);

    const tx = await buildCardanoUnsignedTx({
      inputs: sel.inputs,
      outputs: sel.outputs,
      fee: sel.fee,
      ttl: sel.ttl,
    });
    expect(tx.family).toBe("cardano");
    expect(tx.digest).toMatch(/^0x[0-9a-f]{64}$/); // blake2b-256 body hash

    // The body round-trips with the selector's fee/ttl/outputs intact.
    const CSL = await import("@emurgo/cardano-serialization-lib-nodejs");
    const body = CSL.TransactionBody.from_bytes(Buffer.from(tx.serialized.slice(2), "hex"));
    expect(body.fee().to_str()).toBe(sel.fee);
    expect(body.ttl_bignum()?.to_str()).toBe(String(TTL));
    expect(body.outputs().len()).toBe(sel.outputs.length);
    body.free();
  });

  it("drops dust change to fee when the leftover is below min-ADA", async () => {
    // Fund just above target + fee but below target + fee + minChangeAda.
    // target 5 ADA; 1-in/1-out fee ≈ 0.17 ADA; minChange ≈ 0.97 ADA. So
    // funding 5.5 ADA leaves ~0.33 ADA < minChange → no change output.
    const sel = await selectCardanoInputs(
      [utxo("b".repeat(64), "5500000")],
      [{ address: ADDR, lovelace: "5000000" }],
      PARAMS,
      ADDR,
      TTL,
    );
    expect(sel.outputs).toHaveLength(1); // recipients only
    expect(sel.change).toBe("0");
    expect(sel.fee).toBe((5_500_000 - 5_000_000).toString());
  });

  it("throws when the candidate set cannot cover outputs + fee", async () => {
    await expect(
      selectCardanoInputs([utxo("c".repeat(64), "1000000")], [{ address: ADDR, lovelace: "5000000" }], PARAMS, ADDR, TTL),
    ).rejects.toThrow(/insufficient funds/);
  });
});
