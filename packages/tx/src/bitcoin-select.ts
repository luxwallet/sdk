/**
 * Bitcoin coin-selection + fee-estimation helper — REAL, fully offline,
 * permissive (hand-rolled; no extra deps beyond @scure/base for the
 * output-address script decode). Turns a UTXO set + recipient outputs +
 * a fee rate into a complete `{ inputs, outputs(+change), fee }` that
 * feeds straight into `buildBitcoinUnsignedTx`. The builder still owns
 * the PSBT encoding; this only decides WHICH coins to spend and HOW MUCH
 * change to return.
 *
 * Strategy: accumulative largest-first. Deterministic, allocation-free
 * of surprises, and good enough for a wallet (BnB-style waste
 * minimisation is an optimisation, not a correctness requirement — the
 * fee is exact either way). Sort candidates by value descending, add
 * until inputs cover outputs + fee, then decide change:
 *   - if change >= the dust threshold for the change script, append a
 *     change output and recompute the fee with it included;
 *   - otherwise drop the change to fee (no change output).
 *
 * Fee model: segwit virtual size. Per BIP-141 weight units / 4:
 *   - tx overhead:   ~10.75 vB (version 4B + locktime 4B + segwit
 *                    marker/flag 0.5wu + in/out counts) → 11 vB.
 *   - P2WPKH input:  68 vB  (outpoint 36 + seq 4 + scriptSig len 1 +
 *                    witness (sig ~72 + pubkey 33 + 2 counts)/4 ≈ 27).
 *   - P2TR  input:   57.5 vB (key-path: witness = 1 count + 1 len +
 *                    64B schnorr sig, /4 ≈ 16.5; +41 non-witness).
 *   - P2WPKH output: 31 vB  (value 8 + scriptPubKey 1+22).
 *   - P2TR  output:  43 vB  (value 8 + scriptPubKey 1+34).
 * These match Bitcoin Core's signed-size estimates within <1 vB; we
 * round up (ceil) so the broadcast fee never underpays.
 */
import { Transaction, NETWORK, TEST_NETWORK } from "@scure/btc-signer";
import type { BitcoinOutput, BitcoinSelection, BitcoinUtxo } from "./types.js";

const TX_OVERHEAD_VB = 11;
const INPUT_VB = { p2wpkh: 68, p2tr: 57.5 } as const;
const OUTPUT_VB = { p2wpkh: 31, p2tr: 43 } as const;

/** Dust threshold (sat) per output type — below this, an output is unspendable. */
const DUST = { p2wpkh: 294, p2tr: 330 } as const;

type ScriptKind = "p2wpkh" | "p2tr";

/** Classify a prevout scriptPubKey hex: P2WPKH (OP_0 push20) or P2TR (OP_1 push32). */
function inputKind(scriptHex: string): ScriptKind {
  const s = scriptHex.toLowerCase();
  if (s.startsWith("0014") && s.length === 44) return "p2wpkh"; // OP_0 <20>
  if (s.startsWith("5120") && s.length === 68) return "p2tr"; // OP_1 <32>
  throw new Error(`@luxwallet/tx: unsupported prevout script (need P2WPKH/P2TR): ${scriptHex}`);
}

/** Classify a destination address by decoding its scriptPubKey via btc-signer. */
function outputKind(address: string, mainnet: boolean): ScriptKind {
  const net = mainnet ? NETWORK : TEST_NETWORK;
  // Encode the address to its scriptPubKey through a throwaway tx output;
  // btc-signer validates the address and yields the program bytes.
  const tmp = new Transaction({ allowUnknownOutputs: true });
  tmp.addOutputAddress(address, 1n, net);
  const spk = tmp.getOutput(0).script;
  if (!spk) throw new Error(`@luxwallet/tx: cannot derive scriptPubKey for ${address}`);
  if (spk.length === 22 && spk[0] === 0x00) return "p2wpkh";
  if (spk.length === 34 && spk[0] === 0x51) return "p2tr";
  throw new Error(`@luxwallet/tx: unsupported destination address (need P2WPKH/P2TR): ${address}`);
}

function vsize(inputs: BitcoinUtxo[], outKinds: ScriptKind[]): number {
  let v = TX_OVERHEAD_VB;
  for (const i of inputs) v += INPUT_VB[inputKind(i.script)];
  for (const k of outKinds) v += OUTPUT_VB[k];
  return Math.ceil(v);
}

function sum(items: { value: string }[]): bigint {
  return items.reduce((a, x) => a + BigInt(x.value), 0n);
}

/**
 * Select inputs from `utxos` to fund `outputs` at `feeRate` (sat/vByte),
 * appending a change output to `changeAddress` when economical.
 *
 * @throws if the candidate set cannot cover outputs + fee.
 */
export function selectBitcoinInputs(
  utxos: BitcoinUtxo[],
  outputs: BitcoinOutput[],
  feeRate: number,
  changeAddress: string,
  mainnet = true,
): BitcoinSelection {
  if (utxos.length === 0) throw new Error("@luxwallet/tx: bitcoin selection needs >= 1 utxo");
  if (outputs.length === 0) throw new Error("@luxwallet/tx: bitcoin selection needs >= 1 output");
  if (!(feeRate > 0)) throw new Error("@luxwallet/tx: bitcoin feeRate must be > 0");

  const target = sum(outputs);
  const baseOutKinds = outputs.map((o) => outputKind(o.address, mainnet));
  const changeKind = outputKind(changeAddress, mainnet);

  // Largest-first: fewest inputs, smallest fee for the common case.
  const sorted = [...utxos].sort((a, b) => (BigInt(b.value) > BigInt(a.value) ? 1 : -1));

  const chosen: BitcoinUtxo[] = [];
  let inTotal = 0n;
  for (const u of sorted) {
    chosen.push(u);
    inTotal += BigInt(u.value);

    // Fee if we add a change output, and fee if we don't.
    const vWithChange = vsize(chosen, [...baseOutKinds, changeKind]);
    const vNoChange = vsize(chosen, baseOutKinds);
    const feeWithChange = BigInt(Math.ceil(vWithChange * feeRate));
    const feeNoChange = BigInt(Math.ceil(vNoChange * feeRate));

    // Enough to cover target + fee (no-change case)?
    if (inTotal < target + feeNoChange) continue;

    const change = inTotal - target - feeWithChange;
    if (change >= BigInt(DUST[changeKind])) {
      // Keep change: outputs = recipients + change, fee = feeWithChange.
      const outs: BitcoinOutput[] = [...outputs, { address: changeAddress, value: change.toString() }];
      return {
        inputs: chosen,
        outputs: outs,
        fee: feeWithChange.toString(),
        vsize: vWithChange,
        change: change.toString(),
      };
    }
    // Change is dust (or negative): drop it to fee. Recipients only.
    return {
      inputs: chosen,
      outputs: [...outputs],
      fee: (inTotal - target).toString(),
      vsize: vNoChange,
      change: "0",
    };
  }

  throw new Error(
    `@luxwallet/tx: insufficient funds — have ${inTotal} sat, need ${target} sat + fee`,
  );
}
