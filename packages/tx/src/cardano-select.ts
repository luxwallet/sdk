/**
 * Cardano coin-selection + min-fee helper — REAL, async (WASM), permissive.
 *
 * Lib: @emurgo/cardano-serialization-lib-nodejs (MIT/Apache) — lazily
 * `import()`ed, same as the builder, so the WASM stays off the sync path.
 * Browser/native consumers swap the `-browser`/`-asmjs` build.
 *
 * Turns a UTXO set + recipient outputs + protocol params into a complete
 * `{ inputs, outputs(+change), fee, ttl }` that feeds straight into
 * `buildCardanoUnsignedTx`. The EXACT min-fee is computed by CSL's
 * `min_fee(tx, linearFee)` over a candidate transaction whose witness
 * set is padded with `signerCount` dummy vkey witnesses (each a fixed
 * 32B vkey + 64B sig) — this is how Cardano sizes fees: the fee is a
 * linear function of the fully-witnessed tx byte length, and the witness
 * bytes are deterministic for a known key count. We never sign here; the
 * dummy witnesses exist only to size the fee.
 *
 * Strategy: accumulative largest-first (deterministic, minimal inputs).
 * Change handling: if the leftover after target + fee covers the
 * minimum-ADA-per-UTXO for a change output, append change and recompute
 * the fee with it; otherwise drop the leftover to fee (no change output).
 */
import type {
  CardanoOutput,
  CardanoProtocolParams,
  CardanoSelection,
  CardanoUtxo,
} from "./types.js";

type CSL = typeof import("@emurgo/cardano-serialization-lib-nodejs");

let cslPromise: Promise<CSL> | undefined;
async function loadCsl(): Promise<CSL> {
  if (!cslPromise) cslPromise = import("@emurgo/cardano-serialization-lib-nodejs");
  return cslPromise;
}

function hexDecode(hexStr: string): Uint8Array {
  const clean = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Build the inputs collection from the chosen UTXOs. */
function buildInputs(CSL: CSL, chosen: CardanoUtxo[]) {
  const inputs = CSL.TransactionInputs.new();
  for (const u of chosen) {
    inputs.add(CSL.TransactionInput.new(CSL.TransactionHash.from_bytes(hexDecode(u.txid)), u.index));
  }
  return inputs;
}

/** Build the outputs collection (recipients, optionally + change). */
function buildOutputs(CSL: CSL, outs: CardanoOutput[]) {
  const outputs = CSL.TransactionOutputs.new();
  for (const o of outs) {
    outputs.add(
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(o.address),
        CSL.Value.new(CSL.BigNum.from_str(o.lovelace)),
      ),
    );
  }
  return outputs;
}

/** A witness set with `n` dummy vkey witnesses — for fee SIZING only. */
function dummyWitnessSet(CSL: CSL, n: number) {
  const ws = CSL.TransactionWitnessSet.new();
  if (n <= 0) return ws;
  const vkeys = CSL.Vkeywitnesses.new();
  const vk = CSL.Vkey.new(CSL.PublicKey.from_bytes(new Uint8Array(32)));
  const sig = CSL.Ed25519Signature.from_bytes(new Uint8Array(64));
  for (let i = 0; i < n; i++) vkeys.add(CSL.Vkeywitness.new(vk, sig));
  ws.set_vkeys(vkeys);
  return ws;
}

type TxBody = import("@emurgo/cardano-serialization-lib-nodejs").TransactionBody;

/**
 * Exact min-fee (lovelace) for the body produced by `makeBody(fee)` with
 * `signerCount` witnesses. Cardano's fee is a linear function of the
 * FULLY-witnessed serialized size, and the fee field's own CBOR length
 * grows with its value — so the fee depends on itself. `TransactionBody`
 * is immutable (fee is a constructor arg), so we iterate to a fixpoint by
 * rebuilding the body with the current fee estimate each round (converges
 * in ≤2 rounds). The result equals `min_fee` of the final broadcastable
 * tx, which is exactly what `buildCardanoUnsignedTx` will encode with this
 * fee — no underpay, no overpay.
 */
function minFee(
  CSL: CSL,
  makeBody: (fee: bigint) => TxBody,
  signerCount: number,
  params: CardanoProtocolParams,
): bigint {
  const ws = dummyWitnessSet(CSL, signerCount);
  const linearFee = CSL.LinearFee.new(
    CSL.BigNum.from_str(String(params.minFeeA)),
    CSL.BigNum.from_str(String(params.minFeeB)),
  );
  let fee = 0n;
  for (let i = 0; i < 4; i++) {
    const body = makeBody(fee);
    const tx = CSL.Transaction.new(body, ws);
    const next = BigInt(CSL.min_fee(tx, linearFee).to_str());
    tx.free();
    body.free();
    if (next === fee) break;
    fee = next;
  }
  ws.free();
  linearFee.free();
  return fee;
}

/** Minimum lovelace a UTXO (here: the change output) must hold. */
function minChangeAda(
  CSL: CSL,
  changeAddress: string,
  params: CardanoProtocolParams,
): bigint {
  const dummy = CSL.TransactionOutput.new(
    CSL.Address.from_bech32(changeAddress),
    CSL.Value.new(CSL.BigNum.from_str("1000000")),
  );
  const dataCost = CSL.DataCost.new_coins_per_byte(CSL.BigNum.from_str(String(params.coinsPerUtxoByte)));
  const min = BigInt(CSL.min_ada_for_output(dummy, dataCost).to_str());
  dummy.free();
  dataCost.free();
  return min;
}

function sum(items: { lovelace: string }[]): bigint {
  return items.reduce((a, x) => a + BigInt(x.lovelace), 0n);
}

/**
 * Select inputs from `utxos` to fund `outputs` at the network's min-fee,
 * appending a change output to `changeAddress` when it clears the
 * minimum-ADA threshold. `signerCount` is the number of DISTINCT signing
 * keys (default 1 — a single-account wallet signs every input with one
 * key); it drives the witness-set size used for the fee.
 *
 * @throws if the candidate set cannot cover outputs + fee.
 */
export async function selectCardanoInputs(
  utxos: CardanoUtxo[],
  outputs: CardanoOutput[],
  params: CardanoProtocolParams,
  changeAddress: string,
  ttl: number,
  signerCount = 1,
): Promise<CardanoSelection> {
  if (utxos.length === 0) throw new Error("@luxwallet/tx: cardano selection needs >= 1 utxo");
  if (outputs.length === 0) throw new Error("@luxwallet/tx: cardano selection needs >= 1 output");

  const CSL = await loadCsl();
  try {
    const target = sum(outputs);
    const minChange = minChangeAda(CSL, changeAddress, params);

    const sorted = [...utxos].sort((a, b) => (BigInt(b.lovelace) > BigInt(a.lovelace) ? 1 : -1));

    const chosen: CardanoUtxo[] = [];
    let inTotal = 0n;

    // Build a tx body for the given output set at the given fee. The fee
    // (and change) varies between fixpoint rounds, so this is a closure.
    const bodyFor = (outs: CardanoOutput[]) => (fee: bigint): TxBody => {
      const inputs = buildInputs(CSL, chosen);
      const outputsColl = buildOutputs(CSL, outs);
      const body = CSL.TransactionBody.new_tx_body(inputs, outputsColl, CSL.BigNum.from_str(fee.toString()));
      body.set_ttl(CSL.BigNum.from_str(String(ttl)));
      inputs.free();
      outputsColl.free();
      return body;
    };

    for (const u of sorted) {
      chosen.push(u);
      inTotal += BigInt(u.lovelace);

      // Fee WITHOUT change (recipients only).
      const feeNoChange = minFee(CSL, bodyFor(outputs), signerCount, params);
      if (inTotal < target + feeNoChange) continue;

      // Fee + change are coupled: the change output's lovelace value
      // changes its CBOR length, which changes the fee, which changes the
      // change. Solve the fixpoint with the ACTUAL change value in the
      // body (seed with min-ADA), so the reported fee equals min_fee of
      // the exact tx buildCardanoUnsignedTx will encode.
      let change = minChange;
      let feeWithChange = 0n;
      for (let i = 0; i < 4; i++) {
        const changeOut: CardanoOutput = { address: changeAddress, lovelace: change.toString() };
        feeWithChange = minFee(CSL, bodyFor([...outputs, changeOut]), signerCount, params);
        const nextChange = inTotal - target - feeWithChange;
        if (nextChange === change) break;
        change = nextChange < 0n ? 0n : nextChange;
      }
      if (change >= minChange) {
        return {
          inputs: chosen.map((u) => ({ txid: u.txid, index: u.index })),
          outputs: [...outputs, { address: changeAddress, lovelace: change.toString() }],
          fee: feeWithChange.toString(),
          ttl,
          change: change.toString(),
        };
      }
      // Change below min-ADA → drop to fee, recipients only.
      return {
        inputs: chosen.map((u) => ({ txid: u.txid, index: u.index })),
        outputs: [...outputs],
        fee: (inTotal - target).toString(),
        ttl,
        change: "0",
      };
    }

    throw new Error(
      `@luxwallet/tx: insufficient funds — have ${inTotal} lovelace, need ${target} + fee`,
    );
  } finally {
    // CSL objects above are freed inline; nothing module-level to release.
  }
}
