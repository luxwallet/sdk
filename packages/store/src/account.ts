/**
 * Pure account derivation. No store, no keychain, no clock, no randomness —
 * key material in, account identity + secrets out. The store supplies the
 * bookkeeping ({@link AccountMeta}: id/label/type/createdAt), seals the
 * returned secrets, and inserts the account.
 */
import { ethers } from "ethers";

import { fromHex, toHex } from "./hex.js";
import type { CryptoEngine, LuxAccount, WalletType } from "./types.js";

/** Store-supplied bookkeeping, kept out of the pure derivation. */
export interface AccountMeta {
  id: string;
  label: string;
  type: WalletType;
  createdAt: number;
}

/** A derived account plus the secrets the store seals into the keychain. */
export interface BuiltAccount {
  account: LuxAccount;
  secrets: { mnemonic?: string; privateKey: string };
}

/** keccak256(pub[1:])[-20:] → EIP-55 checksummed address from a 65-byte pubkey. */
export function addressFromPubkey(engine: CryptoEngine, pub65: Uint8Array): string {
  const hash = engine.keccak256(pub65.slice(1));
  return ethers.getAddress(toHex(hash.slice(-20)));
}

/**
 * Derive an account from a BIP-39 mnemonic. Normalizes whitespace and validates
 * the phrase (throws on a bad phrase) before deriving the classical secp256k1
 * key (BIP-44 m/44'/60'/0'/0/0) and the PQ identity (path `wallet/0`).
 */
export function accountFromMnemonic(
  engine: CryptoEngine,
  mnemonic: string,
  meta: AccountMeta,
): BuiltAccount {
  const phrase = mnemonic.trim().replace(/\s+/g, " ");
  // Validate BIP-39 before deriving (throws on a bad phrase).
  ethers.Mnemonic.fromPhrase(phrase);
  const d = engine.keys.deriveSecp256k1(phrase);
  const si = engine.keys.serviceIdentity(phrase, "wallet/0");
  const account: LuxAccount = {
    id: meta.id,
    label: meta.label,
    type: meta.type,
    evmAddress: ethers.getAddress(toHex(d.address)),
    pqPublicKey: toHex(si.publicKey),
    pqNodeId: si.nodeId,
    hasMnemonic: true,
    createdAt: meta.createdAt,
  };
  return { account, secrets: { mnemonic: phrase, privateKey: toHex(d.privateKey) } };
}

/**
 * Derive an account from a raw 32-byte private key. The address is
 * keccak256(pubkey[1:])[-20:] over the uncompressed public key. No mnemonic,
 * no PQ identity — a key-only account.
 */
export function accountFromPrivateKey(
  engine: CryptoEngine,
  privateKey: string,
  meta: AccountMeta,
): BuiltAccount {
  const pkHex = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const sk = fromHex(pkHex);
  if (sk.length !== 32) throw new Error("private key must be 32 bytes");
  const pub = engine.secp256k1.getPublicKey(sk, false);
  const account: LuxAccount = {
    id: meta.id,
    label: meta.label,
    // A key-only import is intrinsically local-hd-pq — hardcoded (not meta.type)
    // for reference parity, so an untyped caller cannot smuggle another type.
    type: "local-hd-pq",
    evmAddress: addressFromPubkey(engine, pub),
    pqPublicKey: "",
    pqNodeId: "",
    hasMnemonic: false,
    createdAt: meta.createdAt,
  };
  return { account, secrets: { privateKey: pkHex } };
}
