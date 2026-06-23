/**
 * Non-EVM tx builders — typed stubs. Each throws "builder todo" and is
 * marked `builderStatus: "todo"`. The Lux tx-type surface to implement is
 * documented in @luxwallet/tx LLM.md (P-Chain platform txs, X-Chain UTXO
 * txs, atomic import/export, Warp).
 */
import type { BuilderStatus, UnsignedTx } from "./types.js";

/** Status table for the non-EVM families. */
export const BUILDER_STATUS: Record<"platform" | "utxo" | "svm" | "zk", BuilderStatus> = {
  platform: "todo",
  utxo: "todo",
  svm: "todo",
  zk: "todo",
};

function todo(family: string): never {
  throw new Error(`@luxwallet/tx: ${family} builder todo — see LLM.md`);
}

/** P-Chain (platformvm) tx builder. TODO: 26 tx types. */
export function buildPlatformUnsignedTx(_intent: unknown): UnsignedTx {
  return todo("platformvm (P-Chain)");
}

/** X-Chain (exchangevm/xvm) UTXO tx builder. TODO: 8 UTXO tx types. */
export function buildExchangeUnsignedTx(_intent: unknown): UnsignedTx {
  return todo("exchangevm (X-Chain)");
}

/** Generic UTXO tx builder (atomic import/export, Warp). TODO. */
export function buildUtxoUnsignedTx(_intent: unknown): UnsignedTx {
  return todo("utxo");
}

/** SVM (Solana-VM family) tx builder. TODO. */
export function buildSvmUnsignedTx(_intent: unknown): UnsignedTx {
  return todo("svm");
}
