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
 * PARTIAL builders (real payload, but the CALLER supplies chain state the
 * builder cannot derive offline):
 *   - polkadot `buildPolkadotUnsignedTx` (@polkadot/types) — needs runtime
 *               metadata + era/nonce/genesisHash/specVersion/txVersion.
 *   - cardano  `buildCardanoUnsignedTx`  (cardano-serialization-lib, async
 *               WASM) — needs the UTXO set + fee/ttl/protocol params.
 *
 * TODO (Lux-native families, typed stubs): platform (P-Chain), exchange
 * (X-Chain), utxo (atomic/Warp), zk (Z-Chain). See LLM.md.
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
export { buildPolkadotUnsignedTx } from "./polkadot.js";
export { buildCardanoUnsignedTx } from "./cardano.js";

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
  // PARTIAL: needs caller-supplied runtime metadata + era/nonce/versions.
  polkadot: "partial",
  // PARTIAL: needs caller-supplied UTXO set + fee/ttl/protocol params.
  cardano: "partial",
  // Lux-native — typed stubs, see stubs.ts / LLM.md.
  platform: "todo",
  exchange: "todo",
  utxo: "todo",
  zk: "todo",
};
