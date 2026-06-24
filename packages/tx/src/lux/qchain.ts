/**
 * Lux Q-Chain (post-quantum EVM) unsigned-tx builder — REAL, fully offline.
 *
 * The Q-Chain's UNSIGNED transaction is a standard EIP-1559 (type-2) EVM
 * transaction — byte-identical to any EVM chain. Post-quantum affects ONLY
 * the signature the keyring attaches: instead of an secp256k1 ECDSA sig,
 * @luxwallet/keyring signs with ML-DSA-65 (via @luxwallet/crypto, bound to
 * luxfi/crypto) over the SAME digest. The unsigned encoding does not change,
 * so this builder is viem's `serializeTransaction` with the Q-Chain id — the
 * one-and-only-one-way EVM unsigned encoding, reused.
 *
 * We do NOT route through buildEvmUnsignedTx: that gates on the chain
 * registry's `family === "evm"`, but the Q-Chain's family is `pqevm`. The
 * caller supplies the Q-Chain EVM chain id in the intent (like every EVM
 * builder takes a chainId), so the builder is correct regardless of whether
 * a Q-Chain entry carries an evmChainId in the registry.
 *
 * Output: `serialized` = the unsigned EIP-2718 typed-tx bytes
 * (0x02 ‖ rlp([...])); `digest` = keccak256(serialized) — the 32 bytes the
 * keyring's ML-DSA signer signs. This package never signs.
 */
import { keccak256, serializeTransaction, type TransactionSerializableEIP1559 } from "viem";
import type { LuxQTxIntent, UnsignedTx } from "../types.js";

/** Build an unsigned Lux Q-Chain (PQ-EVM) EIP-1559 transaction. */
export function buildQchainUnsignedTx(intent: LuxQTxIntent): UnsignedTx {
  if (!Number.isInteger(intent.chainId) || intent.chainId <= 0) {
    throw new Error("@luxwallet/tx: lux Q requires a positive integer chainId");
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
  // EVM signs keccak256 of the typed-tx bytes; the Q-Chain ML-DSA signer
  // signs the same digest. Surface it explicitly (serialized != digest).
  const digest = keccak256(serialized);

  return {
    family: "lux-q",
    serialized,
    digest,
    summary: {
      chain: "Lux Q-Chain",
      chainId: String(intent.chainId),
      signatureScheme: "ML-DSA-65 (post-quantum)",
      to: intent.to ?? "(deploy)",
      value: intent.value ?? "0",
      nonce: String(intent.nonce),
      gas: intent.gas,
      maxFeePerGas: intent.maxFeePerGas,
    },
  };
}
