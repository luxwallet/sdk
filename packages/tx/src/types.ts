/**
 * Tx builder types. One module per VM family; the family decides which
 * builder applies (see @luxwallet/chains ChainFamily). EVM and the
 * external bridge chains (solana/xrp/ton/bitcoin/polkadot/cardano) are
 * real; the remaining Lux-native families (P/X/UTXO) are typed stubs.
 *
 * This package builds the canonical UNSIGNED encoding; it NEVER signs.
 * Signing lives in @luxwallet/keyring + @luxwallet/crypto, which consume
 * `UnsignedTx.serialized` (and `digest`, when the bytes-to-sign differ
 * from the serialized form).
 */

/**
 * Build status of a `@luxwallet/tx` builder.
 *
 *  - `ready`   a real builder that produces a broadcastable unsigned tx
 *              offline from the intent alone (EVM, Solana, XRP, TON,
 *              Bitcoin).
 *  - `partial` a real builder that produces a correct unsigned
 *              payload/body only when the caller supplies chain state the
 *              builder cannot derive offline (Polkadot needs runtime
 *              metadata + era/nonce/genesisHash; Cardano needs the UTXO
 *              set + protocol params/fee). Honest middle ground: the
 *              cryptography is real, but the caller owns the chain state.
 *  - `todo`    registry entry only; builder is a typed stub. See LLM.md
 *              for the porting plan (Lux P/X/UTXO families).
 *
 * NOTE: `@luxwallet/chains` exposes a registry-level `BuilderStatus` of
 * only `"ready" | "todo"` (it has no notion of caller-supplied chain
 * state). This package's status is a strict superset; do not re-export
 * the chains one here.
 */
export type BuilderStatus = "ready" | "partial" | "todo";

/**
 * An unsigned transaction ready to hand to the signer. `serialized` is the
 * canonical unsigned encoding for the chain family (for EVM: the EIP-2718
 * typed-tx bytes with empty signature). `digest`, when present, is the
 * exact bytes the signer signs when they differ from `serialized` (e.g.
 * XRP's `encodeForSigning` blob, Bitcoin's PSBT sighashes are derived by
 * the signer, Cardano's body hash, the Polkadot signing payload). The
 * signer hashes `digest` as the chain's scheme requires.
 */
export interface UnsignedTx {
  family: string;
  /** 0x-prefixed serialized unsigned tx (or unsigned container: PSBT, BOC, CBOR). */
  serialized: `0x${string}`;
  /**
   * 0x-prefixed bytes the signer signs, when distinct from `serialized`.
   * Absent => sign over `serialized` per the family's scheme.
   */
  digest?: `0x${string}`;
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

/**
 * Solana native (SOL) transfer intent. Fully offline: the caller supplies
 * a `recentBlockhash` fetched from an RPC; everything else is local.
 */
export interface SolanaTxIntent {
  /** Base58 fee-payer / source account (the eventual signer). */
  from: string;
  /** Base58 recipient account. */
  to: string;
  /** Amount in lamports (1 SOL = 1e9 lamports) as a decimal string or number. */
  lamports: string | number;
  /** Recent blockhash (base58) from `getLatestBlockhash`; pins tx lifetime. */
  recentBlockhash: string;
}

/**
 * XRP Ledger native (XRP) Payment intent. Fully offline given the
 * account sequence + a `lastLedgerSequence` ceiling from an RPC.
 */
export interface XrpTxIntent {
  /** Classic r-address of the sender (the signer). */
  account: string;
  /** Classic r-address of the recipient. */
  destination: string;
  /** Amount in drops (1 XRP = 1e6 drops) as a decimal string. */
  amountDrops: string;
  /** Account sequence number (from `account_info`). */
  sequence: number;
  /** Fee in drops (decimal string). Default "10". */
  fee?: string;
  /** Ledger index ceiling after which the tx is invalid (anti-stuck). */
  lastLedgerSequence?: number;
  /** Optional destination tag (exchanges/hosted wallets). */
  destinationTag?: number;
  /** Sender's secp256k1/ed25519 public key (hex), if known at build time. */
  signingPubKey?: string;
}

/**
 * TON native (TON) internal-transfer intent. Builds the wallet-v4 style
 * internal message body to a destination. Fully offline given `seqno`.
 */
export interface TonTxIntent {
  /** Friendly or raw destination address. */
  to: string;
  /** Amount in nanotons (1 TON = 1e9 nano) as a decimal string. */
  amountNano: string;
  /** Wallet seqno (from the wallet contract's `seqno` getter). */
  seqno: number;
  /** Optional UTF-8 comment (text payload). */
  comment?: string;
  /** Message send mode. Default 3 (pay fees separately + ignore errors). */
  sendMode?: number;
  /** Whether the destination must exist (bounceable). Default true. */
  bounce?: boolean;
}

/** A Bitcoin UTXO being spent. `script` is the prevout scriptPubKey (hex). */
export interface BitcoinInput {
  /** Funding tx id (big-endian hex, as shown in explorers). */
  txid: string;
  /** Output index in the funding tx. */
  vout: number;
  /** Value of this output in satoshis (decimal string). */
  value: string;
  /** prevout scriptPubKey (hex) — P2WPKH or P2TR. */
  script: string;
}

/** A Bitcoin output (recipient or change). */
export interface BitcoinOutput {
  /** Recipient address (bech32 / bech32m). */
  address: string;
  /** Value in satoshis (decimal string). */
  value: string;
}

/**
 * Bitcoin transfer intent (P2WPKH / P2TR). Fully offline: the caller
 * supplies the UTXOs to spend and the exact outputs (incl. change) — the
 * builder does not select coins or compute change. `feeRate` is recorded
 * for the confirmation summary only (fee = sum(inputs) - sum(outputs)).
 */
export interface BitcoinTxIntent {
  inputs: BitcoinInput[];
  outputs: BitcoinOutput[];
  /** Fee rate in sat/vByte, for the summary only. */
  feeRate?: number;
  /** Mainnet vs testnet (address/HRP). Default true. */
  mainnet?: boolean;
}

/**
 * A spendable Bitcoin UTXO candidate for `selectBitcoinInputs`. Identical
 * shape to {@link BitcoinInput} — the selector chooses a subset of these
 * to fund the requested outputs.
 */
export type BitcoinUtxo = BitcoinInput;

/**
 * Result of {@link selectBitcoinInputs}: the chosen inputs, the final
 * output set (recipients + an appended change output when the change is
 * economically worth keeping), and the absolute fee in satoshis. Feed
 * `inputs` + `outputs` straight into {@link BitcoinTxIntent}.
 */
export interface BitcoinSelection {
  inputs: BitcoinInput[];
  outputs: BitcoinOutput[];
  /** Absolute fee in satoshis = sum(inputs) - sum(outputs). */
  fee: string;
  /** Estimated signed virtual size (vBytes) the fee was computed from. */
  vsize: number;
  /** Change in satoshis routed back to `changeAddress` (0 if dropped to fee). */
  change: string;
}

/**
 * Polkadot `balances.transferKeepAlive` intent. PARTIAL: a full offline
 * signing payload requires the runtime **metadata** (to SCALE-encode the
 * call) plus era/nonce/genesisHash/specVersion/transactionVersion. The
 * caller fetches these (e.g. `state_getMetadata`, `chain_getBlockHash`,
 * `state_getRuntimeVersion`, `system_accountNextIndex`) and supplies them
 * here; the builder does not connect to a node.
 */
export interface PolkadotTxIntent {
  /** SS58 destination address. */
  dest: string;
  /** Amount in plancks (1 DOT = 1e10 planck) as a decimal string. */
  amount: string;
  /** Sender account nonce. */
  nonce: number;
  /** Tip in plancks (decimal string). Default "0". */
  tip?: string;
  /** Genesis block hash (0x). */
  genesisHash: `0x${string}`;
  /**
   * Block hash the era/mortality anchors to (0x). For an immortal tx pass
   * the genesis hash and `era` "0x00".
   */
  blockHash: `0x${string}`;
  /** SCALE-encoded mortal era (0x), or "0x00" for immortal. Default immortal. */
  era?: `0x${string}`;
  /** Runtime spec version (from `state_getRuntimeVersion`). */
  specVersion: number;
  /** Runtime transaction (extrinsic) version. */
  transactionVersion: number;
  /**
   * Hex SCALE-encoded runtime metadata (`state_getMetadata`). REQUIRED:
   * without it the call cannot be encoded. This is the caller-supplied
   * chain state that makes this builder `partial`.
   */
  metadata: `0x${string}`;
}

/** A Cardano UTXO being spent. */
export interface CardanoInput {
  /** Funding tx id (hex). */
  txid: string;
  /** Output index. */
  index: number;
}

/** A Cardano output (recipient or change). */
export interface CardanoOutput {
  /** Bech32 (addr1...) recipient address. */
  address: string;
  /** Amount in lovelace (1 ADA = 1e6 lovelace) as a decimal string. */
  lovelace: string;
}

/**
 * Cardano transfer intent. The builder constructs a tx body and returns
 * its blake2b-256 hash to sign. The caller supplies the selected inputs,
 * the exact outputs (incl. change), the `fee`, and the `ttl`. Use
 * {@link CardanoSelection} from `selectCardanoInputs` to go from a UTXO
 * set + protocol params to a complete intent (it computes the exact
 * min-fee for the witness count).
 */
export interface CardanoTxIntent {
  inputs: CardanoInput[];
  outputs: CardanoOutput[];
  /** Total fee in lovelace (decimal string). */
  fee: string;
  /** Time-to-live (absolute slot number). */
  ttl: number;
}

/**
 * A spendable Cardano UTXO candidate for `selectCardanoInputs`. Extends
 * {@link CardanoInput} with the ADA value at that output (lovelace) so
 * the selector can pick a covering subset.
 */
export interface CardanoUtxo extends CardanoInput {
  /** Lovelace held at this output (decimal string). */
  lovelace: string;
}

/**
 * Cardano protocol parameters needed for the min-fee calculation. The
 * caller fetches these from a provider (e.g. Blockfrost
 * `/epochs/latest/parameters`): `min_fee_a`/`min_fee_b` are the linear
 * fee coefficients; `coins_per_utxo_byte` bounds the minimum ADA a UTXO
 * (incl. change) must hold.
 */
export interface CardanoProtocolParams {
  /** Linear fee slope (lovelace per byte). Mainnet: 44. */
  minFeeA: number;
  /** Linear fee constant (lovelace). Mainnet: 155381. */
  minFeeB: number;
  /** Minimum lovelace per UTXO byte. Mainnet: 4310. */
  coinsPerUtxoByte: number;
}

/**
 * Result of {@link selectCardanoInputs}: chosen inputs, the final output
 * set (recipients + a change output when above the min-ADA threshold),
 * the exact `fee`, and the `ttl` echoed back. Feed straight into
 * {@link CardanoTxIntent}.
 */
export interface CardanoSelection {
  inputs: CardanoInput[];
  outputs: CardanoOutput[];
  /** Exact min-fee in lovelace for the selected witness count (decimal). */
  fee: string;
  /** Time-to-live echoed back from the request. */
  ttl: number;
  /** Change in lovelace routed to `changeAddress` (0 if dropped to fee). */
  change: string;
}

// ── Lux-native families (X/P/Q/Z) ────────────────────────────────────

/**
 * A secp256k1fx UTXO output for Lux X/P-Chain txs. `addresses` are
 * 20-byte hex short-ids (the keyring derives these); the builder sorts
 * them. The caller picks the UTXOs and outputs (incl. change) — the same
 * UTXO-wallet contract as Bitcoin/Cardano. `assetId` is the 32-byte hex
 * asset id (the LUX asset id on the target chain).
 */
export interface LuxUtxoOutput {
  assetId: string;
  amount: string;
  locktime?: string;
  threshold?: number;
  addresses: string[];
}

/** A secp256k1fx UTXO input (a UTXO being spent) for Lux X/P-Chain txs. */
export interface LuxUtxoInput {
  txId: string;
  outputIndex: number;
  assetId: string;
  amount: string;
  sigIndices?: number[];
}

/**
 * Lux X-Chain (xvm) tx intent. `kind` selects the tx type:
 *  - `base`   asset transfer within the X-Chain (BaseTx).
 *  - `export` move assets to another chain (ExportTx → `destinationChain`).
 *  - `import` claim assets from another chain (ImportTx ← `sourceChain`).
 *
 * The caller supplies the selected UTXOs + outputs (the standard UTXO
 * chain-state, like Bitcoin). `networkId` + `blockchainId` come from the
 * chain registry. The builder emits the canonical unsigned bytes
 * `Codec.Marshal(0, &tx.Unsigned)` — exactly what the keyring signs.
 */
export interface LuxXTxIntent {
  kind: "base" | "export" | "import";
  /** Lux network id (mainnet primary = 1). */
  networkId: number;
  /** 32-byte X-Chain blockchain id (hex). */
  blockchainId: string;
  /** Inputs spent on the X-Chain (BaseTx/Export: the funding UTXOs). */
  inputs: LuxUtxoInput[];
  /** Outputs created on the X-Chain (recipients + change). */
  outputs: LuxUtxoOutput[];
  /** Optional memo (≤256 bytes), hex. Default empty. */
  memo?: string;
  /** export only: 32-byte destination chain id (hex). */
  destinationChain?: string;
  /** export only: outputs created on the destination chain. */
  exportedOutputs?: LuxUtxoOutput[];
  /** import only: 32-byte source chain id (hex). */
  sourceChain?: string;
  /** import only: inputs consumed from the source chain. */
  importedInputs?: LuxUtxoInput[];
}

/**
 * Lux P-Chain (platformvm) tx intent. `kind` selects the tx type:
 *  - `base`         move assets within the P-Chain (BaseTx).
 *  - `import`       claim assets from another chain (ImportTx).
 *  - `export`       move assets to another chain (ExportTx).
 *  - `addValidator` stake to validate the primary network (AddValidatorTx).
 *  - `addDelegator` delegate stake to a validator (AddDelegatorTx).
 *
 * Same UTXO chain-state contract as the X-Chain. Staking txs add the
 * validator window + stake outputs + rewards owner.
 */
export interface LuxPTxIntent {
  kind: "base" | "import" | "export" | "addValidator" | "addDelegator";
  networkId: number;
  /** 32-byte P-Chain blockchain id (hex; the P-Chain id is ids.Empty). */
  blockchainId: string;
  inputs: LuxUtxoInput[];
  outputs: LuxUtxoOutput[];
  memo?: string;
  /** import only. */
  sourceChain?: string;
  importedInputs?: LuxUtxoInput[];
  /** export only. */
  destinationChain?: string;
  exportedOutputs?: LuxUtxoOutput[];
  /** addValidator/addDelegator only: the staking window + stake. */
  validator?: LuxValidator;
  /** addValidator/addDelegator only: locked stake outputs. */
  stakeOutputs?: LuxUtxoOutput[];
  /** addValidator/addDelegator only: who receives staking rewards. */
  rewardsOwner?: LuxOutputOwner;
  /** addValidator only: delegation fee, in 10,000ths of a percent (0..1e6). */
  delegationShares?: number;
}

/** A P-Chain validator window: node + stake amount + start/end times. */
export interface LuxValidator {
  /** 20-byte node id (hex). */
  nodeId: string;
  /** Unix start time of the staking window. */
  start: number;
  /** Unix end time of the staking window. */
  end: number;
  /** Stake weight (base units). */
  weight: string;
}

/** A secp256k1fx output owner set (locktime + threshold + addresses). */
export interface LuxOutputOwner {
  locktime?: string;
  threshold?: number;
  addresses: string[];
}

/**
 * Lux Q-Chain (post-quantum EVM) tx intent. The Q-Chain's UNSIGNED tx is
 * a standard EIP-1559 transaction — identical encoding to any EVM chain.
 * Post-quantum affects only the SIGNATURE the keyring attaches (ML-DSA
 * via luxfi/crypto), not the unsigned bytes. So the unsigned builder is
 * the EVM builder with the Q-Chain's chain id. Fields mirror
 * {@link EvmTxIntent}.
 */
export interface LuxQTxIntent {
  /** Q-Chain EVM chain id. */
  chainId: number;
  to?: `0x${string}`;
  value?: string;
  data?: `0x${string}`;
  nonce: number;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

/**
 * Lux Z-Chain (ZK) transfer intent. The Z-Chain is a UTXO chain (the same
 * secp256k1fx/codec family as the X-Chain) with shielded extensions. The
 * core transfer encoding is the X-Chain BaseTx wire format; this intent
 * scaffolds that core encoding (transparent inputs/outputs). Shielded
 * note commitments ride as memo-encoded extensions in a later revision.
 */
export interface LuxZTxIntent {
  networkId: number;
  /** 32-byte Z-Chain blockchain id (hex). */
  blockchainId: string;
  inputs: LuxUtxoInput[];
  outputs: LuxUtxoOutput[];
  memo?: string;
}
