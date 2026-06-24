/**
 * Lux-native non-EVM tx builders — still typed stubs. Each throws
 * "builder todo" and is marked `builderStatus: "todo"`. The Lux tx-type
 * surface to implement is documented in @luxwallet/tx LLM.md (P-Chain
 * platform txs, X-Chain UTXO txs, atomic import/export, Warp, Z-Chain ZK).
 *
 * The external bridge chains (solana/xrp/ton/bitcoin/polkadot/cardano)
 * are REAL — see their own modules (solana.ts, xrp.ts, …) and
 * BUILDER_STATUS in index.ts. The `svm` stub is gone (Solana is real);
 * the `utxo` stub here covers ONLY Lux atomic import/export, not Bitcoin.
 */
import type { BuilderStatus, UnsignedTx } from "./types.js";

/** Status table for the Lux-native families that remain unimplemented. */
export const STUB_BUILDER_STATUS: Record<"platform" | "utxo" | "zk", BuilderStatus> = {
  platform: "todo", // Lux P-Chain
  utxo: "todo", // Lux atomic import/export + Warp
  zk: "todo", // Lux Z-Chain
};

function todo(family: string): never {
  throw new Error(`@luxwallet/tx: ${family} builder todo — see LLM.md`);
}

/** P-Chain (platformvm) tx builder. TODO: 26 tx types. */
export function buildPlatformUnsignedTx(_intent: unknown): UnsignedTx {
  return todo("platformvm (P-Chain)");
}

/** Lux atomic import/export + Warp tx builder. TODO. */
export function buildUtxoUnsignedTx(_intent: unknown): UnsignedTx {
  return todo("utxo (atomic import/export, Warp)");
}

/** Z-Chain (ZK) tx builder. TODO. */
export function buildZkUnsignedTx(_intent: unknown): UnsignedTx {
  return todo("zk (Z-Chain)");
}
