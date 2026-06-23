/**
 * EVM tx builder — REAL. Produces a canonical unsigned EIP-1559 (type 2)
 * transaction from an intent, using viem's `serializeTransaction`. The
 * output is the unsigned EIP-2718 typed-tx bytes; the signer signs the
 * keccak256 of these bytes and viem re-serializes with the signature.
 */
import { serializeTransaction, type TransactionSerializableEIP1559 } from "viem";
import { getChain } from "@luxwallet/chains";
import type { EvmTxIntent, UnsignedTx } from "./types.js";

/** Build an unsigned EIP-1559 EVM transaction from an intent. */
export function buildEvmUnsignedTx(intent: EvmTxIntent): UnsignedTx {
  const chain = getChain(intent.chainId);
  if (!chain || chain.family !== "evm") {
    throw new Error(`@luxwallet/tx: ${intent.chainId} is not a known EVM chain`);
  }

  const tx: TransactionSerializableEIP1559 = {
    type: "eip1559",
    chainId: intent.chainId,
    nonce: intent.nonce,
    to: intent.to,
    value: BigInt(intent.value ?? "0"),
    data: intent.data ?? "0x",
    gas: BigInt(intent.gas),
    maxFeePerGas: BigInt(intent.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(intent.maxPriorityFeePerGas),
  };

  // No signature arg => unsigned serialization (0x02 || rlp([...])).
  const serialized = serializeTransaction(tx);

  return {
    family: "evm",
    serialized,
    summary: {
      chain: chain.name,
      chainId: String(intent.chainId),
      to: intent.to ?? "(deploy)",
      value: intent.value ?? "0",
      nonce: String(intent.nonce),
      gas: intent.gas,
      maxFeePerGas: intent.maxFeePerGas,
    },
  };
}
