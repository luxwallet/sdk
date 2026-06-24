import { describe, expect, it } from "vitest";
import { Transaction } from "@scure/btc-signer";
import { hex } from "@scure/base";
import { buildBitcoinUnsignedTx } from "./bitcoin.js";

// A real mainnet P2WPKH scriptPubKey: OP_0 <20-byte hash>.
const P2WPKH_SCRIPT = "0014751e76e8199196d454941c45d1b3a323f1433bd6";
// bc1q... P2WPKH address matching that exact hash, and a valid P2TR change
// address (both derived via @scure/btc-signer for current bech32/bech32m).
const DEST = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const CHANGE = "bc1pmg5dhafms6h9nts4dtehgkanym6yeccfmk5hx3ts3jxnm4zh2knqv80ha5";
const TXID = "f".repeat(64); // arbitrary 32-byte funding txid

describe("@luxwallet/tx Bitcoin builder (real)", () => {
  const intent = {
    inputs: [{ txid: TXID, vout: 0, value: "100000", script: P2WPKH_SCRIPT }],
    outputs: [
      { address: DEST, value: "90000" },
      { address: CHANGE, value: "9000" },
    ],
    feeRate: 10,
  };

  it("produces an unsigned PSBT (magic 'psbt\\xff' = 0x70736274ff)", () => {
    const tx = buildBitcoinUnsignedTx(intent);
    expect(tx.family).toBe("bitcoin");
    expect(tx.serialized.startsWith("0x70736274ff")).toBe(true);
  });

  it("computes fee = sum(inputs) - sum(outputs) and records it", () => {
    const tx = buildBitcoinUnsignedTx(intent);
    expect(tx.summary.fee).toBe("1000"); // 100000 - (90000 + 9000)
    expect(tx.summary.totalIn).toBe("100000");
    expect(tx.summary.totalOut).toBe("99000");
  });

  it("round-trips: the PSBT parses back with the input + outputs intact", () => {
    const tx = buildBitcoinUnsignedTx(intent);
    const psbt = hex.decode(tx.serialized.slice(2));
    const parsed = Transaction.fromPSBT(psbt);

    expect(parsed.inputsLength).toBe(1);
    expect(parsed.outputsLength).toBe(2);

    // Prevout txid is byte-reversed from the explorer form.
    const input = parsed.getInput(0);
    expect(hex.encode(input.txid!.slice().reverse())).toBe(TXID);
    expect(input.index).toBe(0);
    expect(input.witnessUtxo?.amount).toBe(100000n);

    // Outputs preserve amounts.
    expect(parsed.getOutput(0).amount).toBe(90000n);
    expect(parsed.getOutput(1).amount).toBe(9000n);
  });

  it("is unsigned (no finalized witness on the input)", () => {
    const tx = buildBitcoinUnsignedTx(intent);
    const parsed = Transaction.fromPSBT(hex.decode(tx.serialized.slice(2)));
    expect(parsed.getInput(0).finalScriptWitness).toBeUndefined();
    expect(parsed.isFinal).toBe(false);
  });

  it("rejects outputs exceeding inputs (negative fee)", () => {
    expect(() =>
      buildBitcoinUnsignedTx({
        ...intent,
        outputs: [{ address: DEST, value: "200000" }],
      }),
    ).toThrow(/negative fee/);
  });
});
