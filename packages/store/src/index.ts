/**
 * @luxwallet/store — the one native, omnichain, post-quantum wallet store for
 * Hanzo / Lux / Zoo.
 *
 * Headless and brand-neutral. A consumer wires it up once with a
 * {@link WalletEngineConfig} (crypto loader + keychain + chain provider) and
 * gets the full create / import / reveal / balance / send store. UI adapters
 * live in the app layer over this store; SIWx lives in `@luxwallet/connect`.
 */
export { createLuxWallet } from "./store.js";
export type { LuxWalletState, LuxWalletStore } from "./store.js";

export { tauriKeychain, memoryKeychain } from "./keychain.js";
export type { TauriKeychainBridge } from "./keychain.js";

export { toHex, fromHex } from "./hex.js";

export type {
  WalletType,
  LuxAccount,
  Balance,
  SendParams,
  Status,
  Keychain,
  CryptoEngine,
  RpcClientLike,
  ChainProvider,
  WalletEngineConfig,
} from "./types.js";
