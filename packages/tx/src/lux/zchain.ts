/**
 * Lux Z-Chain (ZK) unsigned-tx builder — REAL core encoding, fully offline,
 * ZERO deps.
 *
 * The Z-Chain is a UTXO chain in the same secp256k1fx/codec family as the
 * X-Chain, with shielded (ZK) extensions layered on top. Its TRANSPARENT
 * transfer — the core, broadcastable transfer of value between addresses —
 * is the X-Chain BaseTx wire format (the canonical lux.BaseTx encoding,
 * verified byte-for-byte against the Go SDK in lux/xvm.test.ts). This
 * builder produces exactly that core encoding via the shared lux/codec +
 * lux/utxo primitives.
 *
 * Scope: transparent inputs/outputs (the value-transfer core). Shielded
 * note commitments / nullifiers ride as memo-encoded extensions in a later
 * revision; they do not change the transparent base encoding produced here,
 * so this core is forward-compatible. `digest` = sha256(unsigned bytes).
 * This package never signs.
 */
import { Writer, fromHex, id32, toHex, withVersion } from "./codec.js";
import { writeInputs, writeOutputs, type LuxInput, type LuxOutput } from "./utxo.js";
import { sha256 } from "./hash.js";
import type { LuxZTxIntent, UnsignedTx } from "../types.js";

// Core transparent transfer uses the canonical BaseTx type-id (0), the same
// UTXO BaseTx the X-Chain uses — the Z-Chain shares the secp256k1fx codec.
const TYPE_ID_BASE = 0;

function toLuxOutputs(outs: LuxZTxIntent["outputs"]): LuxOutput[] {
  return outs.map((o) => ({
    assetId: o.assetId,
    amount: o.amount,
    locktime: o.locktime,
    threshold: o.threshold,
    addresses: o.addresses,
  }));
}

function toLuxInputs(ins: LuxZTxIntent["inputs"]): LuxInput[] {
  return ins.map((i) => ({
    txId: i.txId,
    outputIndex: i.outputIndex,
    assetId: i.assetId,
    amount: i.amount,
    sigIndices: i.sigIndices,
  }));
}

/** Build an unsigned Lux Z-Chain transparent transfer (core encoding). */
export function buildZchainUnsignedTx(intent: LuxZTxIntent): UnsignedTx {
  if (intent.inputs.length === 0) throw new Error("@luxwallet/tx: lux Z requires >= 1 input");
  if (intent.outputs.length === 0) throw new Error("@luxwallet/tx: lux Z requires >= 1 output");

  const w = new Writer();
  w.u32(TYPE_ID_BASE);
  w.u32(intent.networkId);
  w.raw(id32(intent.blockchainId));
  writeOutputs(w, toLuxOutputs(intent.outputs));
  writeInputs(w, toLuxInputs(intent.inputs));
  w.bytes(intent.memo ? fromHex(intent.memo) : new Uint8Array(0));

  const unsigned = withVersion(w.toBytes());
  const digest = sha256(unsigned);

  const totalOut = intent.outputs.reduce((a, o) => a + BigInt(o.amount), 0n);
  return {
    family: "lux-z",
    serialized: toHex(unsigned),
    digest: toHex(digest),
    summary: {
      chain: "Lux Z-Chain",
      kind: "transparent-transfer",
      networkId: String(intent.networkId),
      inputs: String(intent.inputs.length),
      outputs: String(intent.outputs.length),
      amount: totalOut.toString(),
    },
  };
}
