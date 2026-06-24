/**
 * Lux X-Chain (xvm) unsigned-tx builder — REAL, fully offline, ZERO deps.
 *
 * Emits the canonical unsigned bytes `Codec.Marshal(0, &tx.Unsigned)` for
 * the three core UTXO tx types, byte-for-byte matching the Lux SDK
 * (luxfi/proto x/txs). Verified against golden vectors generated from the
 * pinned Go modules — see lux/xvm.test.ts (the X BaseTx KAT reproduces
 * tx-id `2Rxg3BTzwShRePp48i9WX8XpYsFkn8eMNo6AatcgEE9yyGqsni`).
 *
 * Tx type-ids (xvm registration order): BaseTx=0, CreateAssetTx=1,
 * OperationTx=2, ImportTx=3, ExportTx=4.
 *
 * Wire layout per type (after the 2-byte LE version + uint32 LE type-id):
 *   BaseTx:   networkID(u32) blockchainID(32) outs[] ins[] memo([]byte)
 *   ExportTx: <BaseTx fields> destinationChain(32) exportedOuts[]
 *   ImportTx: <BaseTx fields> sourceChain(32) importedIns[]
 *
 * `digest` = the 32-byte SHA-256 of the unsigned bytes (the X-Chain tx
 * id / the bytes hashed before signing). The keyring signs and appends
 * the credential set. This package never signs.
 */
import { Writer, fromHex, id32, toHex, withVersion } from "./codec.js";
import { writeInputs, writeOutputs, type LuxInput, type LuxOutput } from "./utxo.js";
import { sha256 } from "./hash.js";
import type { LuxXTxIntent, UnsignedTx } from "../types.js";

const TYPE_ID = { base: 0, import: 3, export: 4 } as const;

function memoBytes(memo?: string): Uint8Array {
  return memo ? fromHex(memo) : new Uint8Array(0);
}

function toLuxOutputs(outs: LuxXTxIntent["outputs"]): LuxOutput[] {
  return outs.map((o) => ({
    assetId: o.assetId,
    amount: o.amount,
    locktime: o.locktime,
    threshold: o.threshold,
    addresses: o.addresses,
  }));
}

function toLuxInputs(ins: LuxXTxIntent["inputs"]): LuxInput[] {
  return ins.map((i) => ({
    txId: i.txId,
    outputIndex: i.outputIndex,
    assetId: i.assetId,
    amount: i.amount,
    sigIndices: i.sigIndices,
  }));
}

/** Write the BaseTx common fields (no version, no type-id). */
function writeBaseFields(w: Writer, intent: LuxXTxIntent): void {
  w.u32(intent.networkId);
  w.raw(id32(intent.blockchainId));
  writeOutputs(w, toLuxOutputs(intent.outputs));
  writeInputs(w, toLuxInputs(intent.inputs));
  w.bytes(memoBytes(intent.memo));
}

/** Build an unsigned Lux X-Chain tx (base / export / import). */
export function buildXvmUnsignedTx(intent: LuxXTxIntent): UnsignedTx {
  const w = new Writer();

  if (intent.kind === "base") {
    w.u32(TYPE_ID.base);
    writeBaseFields(w, intent);
  } else if (intent.kind === "export") {
    if (!intent.destinationChain) {
      throw new Error("@luxwallet/tx: lux X export requires destinationChain");
    }
    w.u32(TYPE_ID.export);
    writeBaseFields(w, intent);
    w.raw(id32(intent.destinationChain));
    writeOutputs(w, toLuxOutputs(intent.exportedOutputs ?? []));
  } else if (intent.kind === "import") {
    if (!intent.sourceChain) {
      throw new Error("@luxwallet/tx: lux X import requires sourceChain");
    }
    w.u32(TYPE_ID.import);
    writeBaseFields(w, intent);
    w.raw(id32(intent.sourceChain));
    writeInputs(w, toLuxInputs(intent.importedInputs ?? []));
  } else {
    throw new Error(`@luxwallet/tx: unknown lux X tx kind ${(intent as { kind: string }).kind}`);
  }

  const unsigned = withVersion(w.toBytes());
  const digest = sha256(unsigned);

  const totalOut = intent.outputs.reduce((a, o) => a + BigInt(o.amount), 0n);
  return {
    family: "lux-x",
    serialized: toHex(unsigned),
    digest: toHex(digest),
    summary: {
      chain: "Lux X-Chain",
      kind: intent.kind,
      networkId: String(intent.networkId),
      inputs: String(intent.inputs.length),
      outputs: String(intent.outputs.length),
      amount: totalOut.toString(),
      ...(intent.destinationChain ? { destinationChain: intent.destinationChain } : {}),
      ...(intent.sourceChain ? { sourceChain: intent.sourceChain } : {}),
    },
  };
}
