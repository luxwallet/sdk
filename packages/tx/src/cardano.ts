/**
 * Cardano (UTXO) native-transfer builder — PARTIAL, async (WASM).
 *
 * Lib: @emurgo/cardano-serialization-lib-nodejs (MIT/Apache). A WASM
 * module — lazily `import()`ed inside the builder so it stays out of any
 * sync hot path and out of the module-load graph until a Cardano tx is
 * actually built. Browser/native consumers swap the `-browser`/`-asmjs`
 * build; the API is identical.
 *
 * Builds a tx BODY from explicit inputs/outputs/fee/ttl and returns its
 * hash to sign. PARTIAL because the caller supplies the UTXO set, the
 * exact outputs (incl. change) and the `fee` — fee depends on protocol
 * params and the final witness count, which an offline builder cannot
 * determine. The caller computes (or overestimates) it; we record it.
 *
 * Output: `serialized` = the CBOR of the tx body (hex); `digest` = the
 * blake2b-256 body hash (the bytes an ed25519 witness signs). The signer
 * (@luxwallet/keyring) signs `digest` and assembles the witness set +
 * final tx. This package never signs.
 *
 * BuilderStatus: "partial" — real CBOR + body hash, but caller owns the
 * UTXO/params/fee. Mark "ready" only once coin-selection + fee-estimation
 * make it self-contained.
 */
import type { CardanoTxIntent, UnsignedTx } from "./types.js";

type CSL = typeof import("@emurgo/cardano-serialization-lib-nodejs");

let cslPromise: Promise<CSL> | undefined;
/** Lazy-load the WASM lib once; keep it off the sync path. */
async function loadCsl(): Promise<CSL> {
  if (!cslPromise) {
    cslPromise = import("@emurgo/cardano-serialization-lib-nodejs");
  }
  return cslPromise;
}

function hexEncode(bytes: Uint8Array): `0x${string}` {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return `0x${s}`;
}

function hexDecode(hexStr: string): Uint8Array {
  const clean = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Build the unsigned Cardano tx body. Async: lazily loads the WASM lib.
 * Returns the body CBOR (`serialized`) and the body hash to sign (`digest`).
 */
export async function buildCardanoUnsignedTx(intent: CardanoTxIntent): Promise<UnsignedTx> {
  if (intent.inputs.length === 0) throw new Error("@luxwallet/tx: cardano requires >= 1 input");
  if (intent.outputs.length === 0) throw new Error("@luxwallet/tx: cardano requires >= 1 output");

  const CSL = await loadCsl();

  const inputs = CSL.TransactionInputs.new();
  for (const i of intent.inputs) {
    inputs.add(
      CSL.TransactionInput.new(CSL.TransactionHash.from_bytes(hexDecode(i.txid)), i.index),
    );
  }

  const outputs = CSL.TransactionOutputs.new();
  let totalOut = 0n;
  for (const o of intent.outputs) {
    totalOut += BigInt(o.lovelace);
    outputs.add(
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(o.address),
        CSL.Value.new(CSL.BigNum.from_str(o.lovelace)),
      ),
    );
  }

  const fee = CSL.BigNum.from_str(intent.fee);
  const body = CSL.TransactionBody.new_tx_body(inputs, outputs, fee);
  // On TransactionBody (v15) the TTL setter takes a BigNum.
  body.set_ttl(CSL.BigNum.from_str(String(intent.ttl)));

  const bodyBytes = body.to_bytes();
  // The transaction hash IS the blake2b-256 of the CBOR body — the bytes
  // each ed25519 witness signs.
  const fixed = CSL.FixedTransaction.new_from_body_bytes(bodyBytes);
  const bodyHash = fixed.transaction_hash().to_bytes();

  const result: UnsignedTx = {
    family: "cardano",
    serialized: hexEncode(bodyBytes),
    digest: hexEncode(bodyHash),
    summary: {
      chain: "Cardano",
      inputs: String(intent.inputs.length),
      outputs: String(intent.outputs.length),
      totalOut: totalOut.toString(),
      fee: intent.fee,
      ttl: String(intent.ttl),
    },
  };

  // Free WASM-backed objects (no GC finalizers on the wasm heap).
  fixed.free();
  body.free();
  fee.free();
  outputs.free();
  inputs.free();

  return result;
}
