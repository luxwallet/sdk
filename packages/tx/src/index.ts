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

// ── Lux-native stubs (still todo) ────────────────────────────────────
export {
  STUB_BUILDER_STATUS,
  buildPlatformUnsignedTx,
  buildExchangeUnsignedTx,
  buildUtxoUnsignedTx,
  buildZkUnsignedTx,
} from "./stubs.js";

/**
 * Builder readiness, by chain/family key. Honest status:
 *  - `ready`   broadcastable unsigned tx from the intent alone.
 *  - `partial` real payload, but caller supplies chain state (see notes).
 *  - `todo`    typed stub only.
 */
export const BUILDER_STATUS: Record<
  | "evm"
  | "solana"
  | "xrp"
  | "ton"
  | "bitcoin"
  | "polkadot"
  | "cardano"
  | "platform"
  | "exchange"
  | "utxo"
  | "zk",
  BuilderStatus
> = {
  evm: "ready",
  solana: "ready",
  xrp: "ready",
  ton: "ready",
  bitcoin: "ready",
  // READY: intent carries runtime metadata + era/nonce/versions (the
  // standard substrate chain-state); emits the full signing payload.
  polkadot: "ready",
  // READY: intent carries selected inputs/outputs/fee/ttl; emits the body
  // CBOR + blake2b hash. selectCardanoInputs goes UTXO-set → intent.
  cardano: "ready",
  // Lux-native — typed stubs until platformvm.ts/xvm.ts/qchain.ts/zchain.ts land.
  platform: "todo",
  exchange: "todo",
  utxo: "todo",
  zk: "todo",
};
