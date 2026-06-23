/**
 * Crypto facade types. These define the EXACT interface the wallet signs
 * against. The implementation binds the luxfi/crypto C core (via WASM on
 * web/extension, via UniFFI on native) — it is NEVER a pure-JS reimpl, and
 * in particular NEVER @noble/post-quantum. See LLM.md for why.
 *
 * Byte sizes are the FIPS-204 / FIPS-205 / FIPS-203 packed sizes and match
 * the authoritative luxfi constants (utxo/mldsafx/credential.go,
 * luxfi/crypto). Keep them here as the cross-binding contract; the WASM/
 * native impl must agree byte-for-byte.
 */

/** Signature scheme wire byte — matches luxfi consensus SigSchemeID. */
export const Scheme = {
  /** secp256k1 (classical-compat; refused on strict-PQ chains). */
  Secp256k1: 0x10,
  /** ed25519 (classical). */
  Ed25519: 0x20,
  /** ML-DSA-44 (FIPS 204, NIST Cat 2; dev/testnet). */
  MLDSA44: 0x41,
  /** ML-DSA-65 (FIPS 204, NIST Cat 3; production default). */
  MLDSA65: 0x42,
  /** ML-DSA-87 (FIPS 204, NIST Cat 5). */
  MLDSA87: 0x43,
  /** SLH-DSA-SHAKE-128s (FIPS 205, recovery). */
  SLHDSA128s: 0x61,
  /** SLH-DSA-SHAKE-192s (FIPS 205, production recovery default). */
  SLHDSA192s: 0x62,
  /** SLH-DSA-SHAKE-256s (FIPS 205, recovery). */
  SLHDSA256s: 0x63,
} as const;
export type SchemeId = (typeof Scheme)[keyof typeof Scheme];

/** Packed key/sig sizes (bytes). Authoritative; impl must match exactly. */
export const Sizes = {
  // ML-DSA (FIPS 204) — from luxfi/utxo/mldsafx/credential.go.
  mldsa44: { pk: 1312, sig: 2420 },
  mldsa65: { pk: 1952, sig: 3309 },
  mldsa87: { pk: 2592, sig: 4627 },
  // ML-KEM-768 (FIPS 203).
  mlkem768: { ek: 1184, dk: 2400, ct: 1088, ss: 32 },
  // Classical.
  secp256k1: { pk: 33, sig: 64 },
  ed25519: { pk: 32, sig: 64 },
} as const;

/** A keypair as packed bytes. */
export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** ML-KEM encapsulation output. */
export interface Encapsulation {
  /** Ciphertext to send to the holder of the decapsulation key. */
  ciphertext: Uint8Array;
  /** Shared secret (32 bytes). */
  sharedSecret: Uint8Array;
}

/**
 * Signature primitive over packed bytes. One interface; the scheme is
 * fixed by which accessor produced it (mldsa65, secp256k1, ...).
 */
export interface Signer {
  /** Generate a fresh keypair. */
  keypair(): Promise<KeyPair>;
  /**
   * Deterministically derive a keypair from a seed. For ML-DSA the seed
   * is the FIPS-204 xi (32 bytes); for secp256k1/ed25519 it is the 32-byte
   * private scalar/seed. The keyring pre-derives these via @luxwallet/crypto
   * KDF helpers, so this is the binding boundary, not a place for HD logic.
   */
  fromSeed(seed: Uint8Array): Promise<KeyPair>;
  /** Sign a message (already hashed/framed by the caller where required). */
  sign(secretKey: Uint8Array, message: Uint8Array): Promise<Uint8Array>;
  /** Verify a signature. */
  verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean>;
}

/** KEM primitive (ML-KEM-768). */
export interface Kem {
  keypair(): Promise<KeyPair>;
  /** Encapsulate to a public (encapsulation) key. */
  encapsulate(publicKey: Uint8Array): Promise<Encapsulation>;
  /** Decapsulate a ciphertext with the secret (decapsulation) key. */
  decapsulate(secretKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>;
}

/**
 * The crypto backend. A single object the rest of the SDK depends on.
 * Bound at runtime to the luxfi/crypto WASM (web/ext) or native (UniFFI)
 * module. `ready()` resolves once the backend is loaded.
 */
export interface CryptoBackend {
  /** Resolves when the underlying WASM/native module is loaded. */
  ready(): Promise<void>;
  /** True once `ready()` has resolved. */
  readonly available: boolean;

  // Post-quantum signatures (FIPS 204).
  readonly mldsa44: Signer;
  readonly mldsa65: Signer;
  readonly mldsa87: Signer;

  // Stateless hash-based recovery signatures (FIPS 205).
  readonly slhdsa192s: Signer;

  // KEM (FIPS 203).
  readonly mlkem768: Kem;

  // Classical.
  readonly secp256k1: Signer;
  readonly ed25519: Signer;

  /** SHAKE256 XOF — used for AccountID/KDF (cSHAKE built on top). */
  shake256(input: Uint8Array, outLen: number): Promise<Uint8Array>;
}
