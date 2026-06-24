/**
 * @luxwallet/tx — per-VM transaction builders.
 *
 * REAL builders (produce a broadcastable unsigned tx/payload offline):
 *   - evm      `buildEvmUnsignedTx`      (viem)
 *   - solana   `buildSolanaUnsignedTx`   (@solana/web3.js)
 *   - xrp      `buildXrpUnsignedTx`      (xrpl)
 *   - ton      `buildTonUnsignedTx`      (@ton/core)
 *   - bitcoin  `buildBitcoinUnsignedTx`  (@scure/btc-signer)
 *
 * READY, caller supplies standard chain-state (same contract as EVM's
 * nonce/gas or Solana's blockhash — the cryptography is complete and the
 * payload is broadcastable once the intent carries the required fields):
 *   - polkadot `buildPolkadotUnsignedTx` (@polkadot/types) — intent carries
 *               runtime metadata + era/nonce/genesisHash/specVersion/
 *               txVersion; emits the full GenericExtrinsicPayload bytes.
 *   - cardano  `buildCardanoUnsignedTx`  (cardano-serialization-lib, async
 *               WASM) — intent carries selected inputs/outputs/fee/ttl;
 *               emits the tx body CBOR + blake2b-256 body hash.
 *               `selectCardanoInputs` does coin-selection + exact min-fee
 *               so a caller goes from a UTXO set to a complete intent.
 *               `selectBitcoinInputs` does the same for bitcoin.
 *
 * Lux-native (P/X/Q/Z) builders live in their own modules (platformvm.ts,
 * xvm.ts, qchain.ts, zchain.ts).
 *
 * The signer (@luxwallet/keyring + @luxwallet/crypto) consumes
 * `UnsignedTx.serialized` (and `digest`, when the bytes-to-sign differ);
 * this package NEVER signs.
 */
import type { BuilderStatus } from "./types.js";

export * from "./types.js";

// ── Real / partial builders ──────────────────────────────────────────
export { buildEvmUnsignedTx } from "./evm.js";
export { buildSolanaUnsignedTx } from "./solana.js";
export { buildXrpUnsignedTx } from "./xrp.js";
export { buildTonUnsignedTx } from "./ton.js";
export { buildBitcoinUnsignedTx } from "./bitcoin.js";
export { selectBitcoinInputs } from "./bitcoin-select.js";
export { buildPolkadotUnsignedTx } from "./polkadot.js";
export { buildCardanoUnsignedTx } from "./cardano.js";
export { selectCardanoInputs } from "./cardano-select.js";

// ── Lux-native builders ──────────────────────────────────────────────
export { buildXvmUnsignedTx } from "./lux/xvm.js";
export { buildPlatformvmUnsignedTx } from "./lux/platformvm.js";
export { buildQchainUnsignedTx } from "./lux/qchain.js";
export { buildZchainUnsignedTx } from "./lux/zchain.js";

/**
 * Builder readiness, by builder key. Keyed by builder identity (not chain
 * family — `bitcoin` and `luxX` are both the `utxo` family but distinct
 * builders). Honest status:
 *  - `ready`   broadcastable unsigned tx (+ bytes-to-sign) from the intent.
 *  - `todo`    typed stub only.
 *
 * Lux-native keys map to chains: luxX → X-Chain (utxo), luxP → P-Chain
 * (platform), luxQ → Q-Chain (pqevm), luxZ → Z-Chain (zk).
 */
export const BUILDER_STATUS: Record<
  | "evm"
  | "solana"
  | "xrp"
  | "ton"
  | "bitcoin"
  | "polkadot"
  | "cardano"
  | "luxX"
  | "luxP"
  | "luxQ"
  | "luxZ",
  BuilderStatus
> = {
  evm: "ready",
  solana: "ready",
  xrp: "ready",
  ton: "ready",
  bitcoin: "ready",
  // intent carries runtime metadata + era/nonce/versions (the standard
  // substrate chain-state); emits the full signing payload.
  polkadot: "ready",
  // intent carries selected inputs/outputs/fee/ttl; emits the body CBOR +
  // blake2b hash. selectCardanoInputs goes UTXO-set → intent.
  cardano: "ready",
  // Lux X-Chain (xvm) — base/export/import bytes match the Go SDK
  // byte-for-byte (lux/xvm.test.ts KAT).
  luxX: "ready",
  // Lux P-Chain (platformvm) — base/import/export/addValidator/addDelegator
  // match the Go SDK byte-for-byte (lux/platformvm.test.ts KAT).
  luxP: "ready",
  // Lux Q-Chain (PQ-EVM) — unsigned tx is canonical EIP-1559 (PQ affects
  // only the signature); round-trips through viem (lux/qchain.test.ts).
  luxQ: "ready",
  // Lux Z-Chain (ZK) — transparent transfer = the verified X-Chain BaseTx
  // encoding (lux/zchain.test.ts); shielded notes are a memo extension.
  luxZ: "ready",
};
