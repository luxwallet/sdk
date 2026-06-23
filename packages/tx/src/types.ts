/**
 * Tx builder types. One module per VM family; the family decides which
 * builder applies (see @luxwallet/chains ChainFamily). EVM is real; the
 * rest are typed stubs with `builderStatus: "todo"`.
 */
import type { BuilderStatus } from "@luxwallet/chains";

export type { BuilderStatus };

/**
 * An unsigned transaction ready to hand to the signer. `serialized` is the
 * canonical unsigned encoding for the chain family (for EVM: the EIP-2718
 * typed-tx bytes with empty signature). `digest`, when present, is the
 * bytes the signer signs (caller hashes as the scheme requires).
 */
export interface UnsignedTx {
  family: string;
  /** 0x-prefixed serialized unsigned tx. */
  serialized: `0x${string}`;
  /** Human-meaningful summary for confirmation UIs. */
  summary: Record<string, string>;
}

/** EVM transfer/contract-call intent. Values are decimal strings (wei). */
export interface EvmTxIntent {
  /** EIP-155 chain id. */
  chainId: number;
  /** 0x recipient (omit to deploy). */
  to?: `0x${string}`;
  /** Value in wei as a decimal string. Default "0". */
  value?: string;
  /** Calldata. Default "0x". */
  data?: `0x${string}`;
  /** Account nonce (from RpcClient.getTransactionCount). */
  nonce: number;
  /** Gas limit. */
  gas: string;
  /** EIP-1559 max fee per gas (wei). */
  maxFeePerGas: string;
  /** EIP-1559 max priority fee per gas (wei). */
  maxPriorityFeePerGas: string;
}
