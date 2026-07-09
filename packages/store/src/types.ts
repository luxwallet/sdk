/**
 * @luxwallet/store — public value types.
 *
 * Brand-neutral: no hanzo/zoo/lux literals. The chain list, gateway, keychain,
 * and crypto engine are all injected by the consumer through
 * {@link WalletEngineConfig}, so the same headless store backs every brand.
 */
import type { ChainEntry } from "@luxwallet/chains";

/**
 * How an account's keys are held.
 *  - `local-hd-pq`  HD seed on device (keychain), classical secp256k1 + a PQ
 *                   ML-DSA-65 identity. The default.
 *  - `mpc`          threshold key — no single device holds the whole secret;
 *                   signing is co-operative.
 *  - `safe`         a Safe smart-account; this device holds an owner key.
 */
export type WalletType = "local-hd-pq" | "mpc" | "safe";

export interface LuxAccount {
  id: string;
  label: string;
  type: WalletType;
  /** EIP-55 checksummed EVM address. */
  evmAddress: string;
  /** 0x-hex ML-DSA-65 public key (empty for private-key-only imports). */
  pqPublicKey: string;
  /** Lux NodeID derived from the PQ identity (empty for key-only imports). */
  pqNodeId: string;
  /** True when a BIP-39 recovery phrase backs this account. */
  hasMnemonic: boolean;
  createdAt: number;
}

export interface Balance {
  wei: string;
  formatted: string;
  symbol: string;
  error?: string;
}

export interface SendParams {
  accountId: string;
  chainId: number;
  to: string;
  amountEther: string;
  data?: string;
}

export type Status = "idle" | "loading" | "ready" | "error";

/**
 * Secret-at-rest seam. Mnemonics/private keys NEVER touch persisted app state.
 * The consumer wires an OS-keychain-backed impl (see {@link tauriKeychain}) or
 * an in-process one for tests ({@link memoryKeychain}).
 */
export interface Keychain {
  seal(id: string, secrets: { mnemonic?: string; privateKey: string }): Promise<void>;
  getMnemonic(id: string): Promise<string | null>;
  getPrivateKey(id: string): Promise<string | null>;
  drop(id: string): Promise<void>;
}

/**
 * The minimal crypto surface the store uses, defined structurally so this
 * package carries no crypto dependency. The consumer injects any object of
 * this shape via {@link WalletEngineConfig.crypto} — the existing `LuxCrypto`
 * WASM engine (secp256k1 keys + keccak256 + ML-DSA-65 identity) satisfies it
 * with zero changes. Only the members the store actually calls are declared.
 */
export interface CryptoEngine {
  /** keccak256 of arbitrary bytes → 32-byte digest. */
  keccak256(data: Uint8Array): Uint8Array;
  keys: {
    /** BIP-44 m/44'/60'/0'/0/0 secp256k1 leaf → 20-byte address + 32-byte key. */
    deriveSecp256k1(mnemonic: string): { address: Uint8Array; privateKey: Uint8Array };
    /** PQ service identity for a derivation path → ML-DSA-65 pubkey + NodeID. */
    serviceIdentity(mnemonic: string, path: string): { publicKey: Uint8Array; nodeId: string };
  };
  secp256k1: {
    /** Public key from a 32-byte secret; `compressed=false` → 65-byte uncompressed. */
    getPublicKey(privateKey: Uint8Array, compressed: boolean): Uint8Array;
    /** Sign a 32-byte digest → 65-byte [r||s||recid] signature. */
    sign(privateKey: Uint8Array, digest: Uint8Array): Uint8Array;
    /** Recover the 65-byte uncompressed public key from a digest + signature. */
    recover(digest: Uint8Array, signature: Uint8Array): Uint8Array;
  };
}

/** The minimal EVM JSON-RPC surface the store needs. Satisfied by @luxwallet/rpc's RpcClient. */
export interface RpcClientLike {
  call<T = unknown>(
    req: { method: string; params?: unknown[] },
    init?: { signal?: AbortSignal },
  ): Promise<T>;
  getTransactionCount(address: string): Promise<number>;
}

/**
 * The brand's chain + RPC wiring, injected. This is the ONE seam through which
 * a brand's network selection, gateway, and per-chain overrides reach the
 * headless engine — core never reads brand config directly.
 */
export interface ChainProvider {
  chainById(id: string | number): ChainEntry | undefined;
  defaultChainId(): number;
  rpcClient(chainId: number): RpcClientLike;
}

/** Everything the headless wallet engine needs, injected by the consumer. */
export interface WalletEngineConfig {
  /** Loads the crypto engine (once, idempotent). App-owned so each bundler
   * resolves its WASM/native backend its own way. */
  crypto: () => Promise<CryptoEngine>;
  /** Secret-at-rest storage. */
  keychain: Keychain;
  /** Brand chain + RPC wiring. */
  chains: ChainProvider;
  /** localStorage key for the persisted (non-secret) slice. Default 'lux-wallet'. */
  persistName?: string;
}
