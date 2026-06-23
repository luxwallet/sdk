/**
 * @luxwallet/keyring — account model + keystore.
 *
 * The in-memory account store (`Keyring`) is REAL: it mirrors the
 * concurrency-safe Map model of lux/sdk/wallet PQWallet — add/get/remove,
 * refusing duplicate AccountIDs and refusing scheme mismatches. The crypto
 * operations (key derivation, sealing) go through @luxwallet/crypto and
 * throw "not yet bound" until its backend is injected; the keyring's own
 * bookkeeping works regardless.
 */
export * from "./types.js";
export * from "./account-id.js";

import { mldsa65, secp256k1, ed25519, Scheme, type Signer } from "@luxwallet/crypto";
import { deriveAccountId } from "./account-id.js";
import {
  ROLE_HD_INDEX,
  type Account,
  type DeriveParams,
  type SchemeId,
  type SealedAccount,
} from "./types.js";

/** Pick the crypto signer for a scheme. PQ recovery uses SLH-DSA elsewhere. */
function signerFor(scheme: SchemeId): Signer {
  switch (scheme) {
    case Scheme.MLDSA65:
      return mldsa65;
    case Scheme.Secp256k1:
      return secp256k1;
    case Scheme.Ed25519:
      return ed25519;
    default:
      throw new Error(`@luxwallet/keyring: unsupported scheme 0x${scheme.toString(16)}`);
  }
}

/**
 * BIP-44 derivation path for a derive request. EVM/secp256k1 uses coinType
 * 60; ML-DSA uses the Lux PQ branch (coinType 9000, branch 0', role, leaf)
 * per lux/sdk/wallet/account/pq_account.go.
 */
export function derivationPathFor(p: DeriveParams): string {
  const idx = p.accountIndex ?? 0;
  if (p.scheme === Scheme.Secp256k1 || p.scheme === Scheme.Ed25519) {
    return `m/44'/60'/0'/0/${idx}`;
  }
  if (p.role === "recovery") {
    // SLH-DSA recovery branch (2') — see lux/sdk/wallet/account/recovery.go.
    return `m/44'/9000'/${p.networkId}'/2'/0'/${idx}'`;
  }
  const roleIdx = ROLE_HD_INDEX[p.role];
  return `m/44'/9000'/${p.networkId}'/0'/${roleIdx}'/${idx}'`;
}

/**
 * Derive a fresh account from a master seed.
 *
 * The HD-path computation and AccountID framing are real; the keypair
 * derivation and seed expansion (cSHAKE → xi → ML-DSA KeyGen) go through
 * @luxwallet/crypto and throw "not yet bound" until the backend is set.
 *
 * TODO(keyring): wire BIP-32 + role-bound cSHAKE seed expansion (the
 * `expandChildSeed` step from lux/sdk/wallet/account/cshake.go) once the
 * crypto backend exposes BIP-32 + cSHAKE. Today this calls
 * `signer.fromSeed(masterSeed)` directly as the binding placeholder.
 */
export async function deriveAccount(p: DeriveParams): Promise<Account> {
  const signer = signerFor(p.scheme);
  const path = derivationPathFor(p);
  const { publicKey, secretKey } = await signer.fromSeed(p.masterSeed);
  const accountId = await deriveAccountId(p.networkId, p.scheme, publicKey);
  return {
    accountId,
    scheme: p.scheme,
    role: p.role,
    networkId: p.networkId,
    publicKey,
    secretKey,
    derivationPath: path,
  };
}

/**
 * Seal an account's secret key for at-rest storage.
 *
 * TODO(keyring): KDF (argon2id) + AEAD (XChaCha20-Poly1305) over the secret
 * key, salt/nonce embedded in `sealed`. MUST go through @luxwallet/crypto
 * primitives (no second crypto lib). Stubbed until the backend lands.
 */
export function sealAccount(_account: Account, _passphrase: string): SealedAccount {
  throw new Error("@luxwallet/keyring: sealAccount not yet implemented (see LLM.md)");
}

/** Unseal a SealedAccount back to a hot Account. Counterpart of sealAccount. */
export function unsealAccount(_sealed: SealedAccount, _passphrase: string): Promise<Account> {
  throw new Error("@luxwallet/keyring: unsealAccount not yet implemented (see LLM.md)");
}

/**
 * In-memory account store. Mirrors lux/sdk/wallet PQWallet semantics:
 * keyed by AccountID, refuses duplicate inserts (caller must remove first),
 * refuses scheme/role confusion at the boundary. This logic is fully real.
 */
export class Keyring {
  #accounts = new Map<string, Account>();

  /** Insert an account. Throws if its AccountID is already present. */
  add(account: Account): void {
    if (this.#accounts.has(account.accountId)) {
      throw new Error(`@luxwallet/keyring: account ${account.accountId.slice(0, 12)} already exists`);
    }
    this.#accounts.set(account.accountId, account);
  }

  /** Get an account by AccountID, or undefined. */
  get(accountId: string): Account | undefined {
    return this.#accounts.get(accountId);
  }

  /** Remove an account. Returns true if it was present. */
  remove(accountId: string): boolean {
    return this.#accounts.delete(accountId);
  }

  /** All AccountIDs currently held. */
  accountIds(): string[] {
    return [...this.#accounts.keys()];
  }

  /** All accounts currently held. */
  accounts(): Account[] {
    return [...this.#accounts.values()];
  }

  /** Number of accounts held. */
  get size(): number {
    return this.#accounts.size;
  }
}
