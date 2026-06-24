/**
 * Bitcoin (UTXO) native-transfer builder — REAL, fully offline.
 *
 * Lib: @scure/btc-signer (MIT). Builds a PSBT (BIP-174) from explicit
 * UTXOs + outputs for P2WPKH/P2TR spends. The caller selects coins and
 * sets outputs (incl. change) — the builder neither selects coins nor
 * computes change; fee = sum(inputs) - sum(outputs), surfaced for the
 * confirmation UI. The unsigned PSBT bytes ARE the container the signer
 * loads, signs each input's sighash, and finalizes. This package never
 * signs.
 */
import { Transaction, NETWORK, TEST_NETWORK } from "@scure/btc-signer";
import { hex } from "@scure/base";
import type { BitcoinTxIntent, UnsignedTx } from "./types.js";

/** Explorer txids are big-endian; PSBT prevout hashes are internal (LE). */
function txidToBytes(txid: string): Uint8Array {
  const be = hex.decode(txid.toLowerCase());
  return be.slice().reverse();
}

function bufToHex(buf: Uint8Array): `0x${string}` {
  return `0x${hex.encode(buf)}`;
}

/** Build an unsigned Bitcoin PSBT (P2WPKH / P2TR) from UTXOs + outputs. */
export function buildBitcoinUnsignedTx(intent: BitcoinTxIntent): UnsignedTx {
  if (intent.inputs.length === 0) throw new Error("@luxwallet/tx: bitcoin requires >= 1 input");
  if (intent.outputs.length === 0) throw new Error("@luxwallet/tx: bitcoin requires >= 1 output");
  const network = intent.mainnet === false ? TEST_NETWORK : NETWORK;

  const tx = new Transaction();

  let totalIn = 0n;
  for (const i of intent.inputs) {
    const amount = BigInt(i.value);
    totalIn += amount;
    tx.addInput({
      txid: txidToBytes(i.txid),
      index: i.vout,
      // Segwit prevout: scriptPubKey + amount is enough to sign P2WPKH/P2TR.
      witnessUtxo: { script: hex.decode(i.script.toLowerCase()), amount },
    });
  }

  let totalOut = 0n;
  for (const o of intent.outputs) {
    const amount = BigInt(o.value);
    totalOut += amount;
    tx.addOutputAddress(o.address, amount, network);
  }

  const fee = totalIn - totalOut;
  if (fee < 0n) {
    throw new Error("@luxwallet/tx: bitcoin outputs exceed inputs (negative fee)");
  }

  // Unsigned PSBT v0 — the signer loads this, signs, and finalizes.
  const psbt = tx.toPSBT(0);

  return {
    family: "bitcoin",
    serialized: bufToHex(psbt),
    summary: {
      chain: intent.mainnet === false ? "Bitcoin (testnet)" : "Bitcoin",
      inputs: String(intent.inputs.length),
      outputs: String(intent.outputs.length),
      totalIn: totalIn.toString(),
      totalOut: totalOut.toString(),
      fee: fee.toString(),
      ...(intent.feeRate !== undefined ? { feeRate: String(intent.feeRate) } : {}),
    },
  };
}
