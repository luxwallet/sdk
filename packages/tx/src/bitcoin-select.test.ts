import { describe, expect, it } from "vitest";
import { Transaction } from "@scure/btc-signer";
import { hex } from "@scure/base";
import { selectBitcoinInputs } from "./bitcoin-select.js";
import { buildBitcoinUnsignedTx } from "./bitcoin.js";

// P2WPKH scriptPubKey (OP_0 <20>) and matching bech32 address.
const P2WPKH_SCRIPT = "0014751e76e8199196d454941c45d1b3a323f1433bd6";
const DEST = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const CHANGE = "bc1pmg5dhafms6h9nts4dtehgkanym6yeccfmk5hx3ts3jxnm4zh2knqv80ha5"; // P2TR

const utxo = (txid: string, value: string) => ({ txid, vout: 0, value, script: P2WPKH_SCRIPT });

describe("@luxwallet/tx selectBitcoinInputs (real)", () => {
  it("selects largest-first, appends change, and the fee matches the estimated vsize", () => {
    const utxos = [utxo("a".repeat(64), "30000"), utxo("b".repeat(64), "100000"), utxo("c".repeat(64), "5000")];
    const sel = selectBitcoinInputs(utxos, [{ address: DEST, value: "90000" }], 10, CHANGE);

    // Largest UTXO (100000) alone covers 90000 + fee → exactly one input.
    expect(sel.inputs).toHaveLength(1);
    expect(sel.inputs[0]!.value).toBe("100000");

    // A change output was appended (recipient + change).
    expect(sel.outputs).toHaveLength(2);
    expect(sel.outputs[1]!.address).toBe(CHANGE);

    // Conservation: inputs = outputs + fee, exactly.
    const inSum = BigInt(sel.inputs[0]!.value);
    const outSum = sel.outputs.reduce((a, o) => a + BigInt(o.value), 0n);
    expect(inSum - outSum).toBe(BigInt(sel.fee));

    // Fee = ceil(vsize * feeRate). 1 P2WPKH in + 1 P2WPKH out + 1 P2TR change.
    expect(BigInt(sel.fee)).toBe(BigInt(Math.ceil(sel.vsize * 10)));
    expect(sel.vsize).toBe(11 + 68 + 31 + 43); // overhead + in + recipient + change
  });

  it("drops dust change to fee instead of creating an unspendable output", () => {
    // Pick a UTXO that leaves only a few sats after target+fee → dust.
    // target 90000, 1-in/1-out fee ≈ ceil((11+68+31)*10)=1100; with change
    // ≈ ceil((11+68+31+43)*10)=1530. Funding 91200 → change 91200-90000-1530<dust.
    const sel = selectBitcoinInputs([utxo("d".repeat(64), "91200")], [{ address: DEST, value: "90000" }], 10, CHANGE);
    expect(sel.outputs).toHaveLength(1); // no change output
    expect(sel.change).toBe("0");
    expect(sel.fee).toBe((91200 - 90000).toString()); // remainder all to fee
  });

  it("feeds straight into buildBitcoinUnsignedTx (end-to-end from a UTXO set)", () => {
    const utxos = [utxo("e".repeat(64), "200000"), utxo("f".repeat(64), "50000")];
    const sel = selectBitcoinInputs(utxos, [{ address: DEST, value: "120000" }], 5, CHANGE);

    const tx = buildBitcoinUnsignedTx({ inputs: sel.inputs, outputs: sel.outputs, feeRate: 5 });
    expect(tx.serialized.startsWith("0x70736274ff")).toBe(true); // PSBT magic
    // The builder's independently-computed fee equals the selector's fee.
    expect(tx.summary.fee).toBe(sel.fee);

    // PSBT parses back with the chosen inputs/outputs intact.
    const parsed = Transaction.fromPSBT(hex.decode(tx.serialized.slice(2)));
    expect(parsed.inputsLength).toBe(sel.inputs.length);
    expect(parsed.outputsLength).toBe(sel.outputs.length);
  });

  it("throws when the candidate set cannot cover outputs + fee", () => {
    expect(() =>
      selectBitcoinInputs([utxo("a".repeat(64), "50000")], [{ address: DEST, value: "90000" }], 10, CHANGE),
    ).toThrow(/insufficient funds/);
  });

  it("rejects non-segwit prevout scripts", () => {
    const legacy = { txid: "a".repeat(64), vout: 0, value: "100000", script: "76a914" + "00".repeat(20) + "88ac" };
    expect(() => selectBitcoinInputs([legacy], [{ address: DEST, value: "1000" }], 10, CHANGE)).toThrow(
      /unsupported prevout script/,
    );
  });
});
