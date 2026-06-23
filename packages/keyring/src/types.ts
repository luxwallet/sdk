/**
 * Keyring types — the account model.
 *
 * Mirrors the working Go impl at lux/sdk/wallet (pq_wallet.go,
 * account/pq_account.go, account/scheme.go). One TS shape per Go type so
 * the wallet model is identical across languages.
 */
import { Scheme, type SchemeId } from "@luxwallet/crypto";

export { Scheme };
export type { SchemeId };

/** 48-byte (384-bit) AccountID. cSHAKE-256 over (chainId, scheme, pubkey). */
export const ACCOUNT_ID_SIZE = 48;

/**
 * What an account is for. Maps to distinct HD role indices so the same
 * master seed cannot produce the same key under two roles. Mirrors
 * account.AccountRole (Go).
 */
export type AccountRole = "identity" | "tx" | "session" | "recovery";

/** Conventional HD role index. Recovery is NOT on the ML-DSA branch. */
export const ROLE_HD_INDEX: Record<Exclude<AccountRole, "recovery">, number> = {
  identity: 0,
  tx: 1,
  session: 2,
};

/**
 * A wallet account: a (scheme, role, key material) triple plus its derived
 * 48-byte AccountID. Flat data carrier — no behavior. The secret key is
 * present only on in-memory accounts; persist it sealed (see Keystore).
 *
 * `publicKey`/`secretKey` are packed bytes for `scheme` (see
 * @luxwallet/crypto Sizes). For EVM/secp256k1 accounts `evmAddress` is the
 * 0x-checksummed address; PQ accounts have no 20-byte address (verification
 * needs the full key) so `evmAddress` is undefined.
 */
export interface Account {
  /** Lowercase hex of the 48-byte AccountID. */
  accountId: string;
  scheme: SchemeId;
  role: AccountRole;
  /** Lux network id this account's AccountID is bound to (cSHAKE input). */
  networkId: number;
  publicKey: Uint8Array;
  /** Present on hot in-memory accounts only. */
  secretKey?: Uint8Array;
  /** BIP-44 derivation path this account was derived under. */
  derivationPath: string;
  /** EVM address for secp256k1 accounts; undefined for PQ. */
  evmAddress?: string;
}

/** A sealed (encrypted-at-rest) account record for the Keystore. */
export interface SealedAccount {
  accountId: string;
  scheme: SchemeId;
  role: AccountRole;
  networkId: number;
  publicKey: Uint8Array;
  derivationPath: string;
  /** Opaque ciphertext of the secret key (KDF + AEAD; see keystore LLM TODO). */
  sealed: Uint8Array;
}

/** Parameters to derive a fresh account from a master seed. */
export interface DeriveParams {
  /** BIP-39 seed bytes (caller owns mnemonic provenance). */
  masterSeed: Uint8Array;
  scheme: SchemeId;
  role: AccountRole;
  /** Lux network id (< 2^31; BIP-32 hardening). */
  networkId: number;
  /** Leaf account index (< 2^31). Default 0. */
  accountIndex?: number;
}
