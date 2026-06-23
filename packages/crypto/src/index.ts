/**
 * @luxwallet/crypto — facade over the luxfi/crypto C core.
 *
 * CRITICAL (see LLM.md):
 *   - The PQ implementation MUST be luxfi/crypto compiled to WASM (web,
 *     extension) or bound via UniFFI (native). It must NOT be
 *     @noble/post-quantum and must NOT port the precompile wire format
 *     from lux/wallet pkgs/wallet/src/features/wallet/pq — a PQ audit
 *     found that wire format WRONG; signatures built that way are rejected
 *     on-chain.
 *   - This package has ZERO crypto dependencies. The real bytes come from
 *     the bound backend, injected via `setBackend`.
 *
 * Until the backend is bound, every primitive throws "not yet bound". The
 * interface (types.ts) is exact and final; only the impl is pending.
 */
export * from "./types.js";

import type { CryptoBackend, KeyPair, Encapsulation, Kem, Signer } from "./types.js";

const NOT_BOUND =
  "@luxwallet/crypto: backend not yet bound. Call setBackend(luxfiCryptoWasm) " +
  "(WASM on web/ext) or the UniFFI binding (native). See package LLM.md.";

/**
 * Reject (not throw) so the facade always honors its `Promise` return
 * contract — callers `await` every primitive, so the "not yet bound" error
 * surfaces uniformly as a rejection.
 */
function rejectNotBound<T>(): Promise<T> {
  return Promise.reject(new Error(NOT_BOUND));
}

/** Stub signer — exact shape, rejects until a real backend is injected. */
const stubSigner: Signer = {
  keypair: () => rejectNotBound(),
  fromSeed: () => rejectNotBound(),
  sign: () => rejectNotBound(),
  verify: () => rejectNotBound(),
};

/** Stub KEM — exact shape, rejects until a real backend is injected. */
const stubKem: Kem = {
  keypair: () => rejectNotBound(),
  encapsulate: () => rejectNotBound(),
  decapsulate: () => rejectNotBound(),
};

const stubBackend: CryptoBackend = {
  ready: () => rejectNotBound(),
  available: false,
  mldsa44: stubSigner,
  mldsa65: stubSigner,
  mldsa87: stubSigner,
  slhdsa192s: stubSigner,
  mlkem768: stubKem,
  secp256k1: stubSigner,
  ed25519: stubSigner,
  shake256: () => rejectNotBound(),
};

let active: CryptoBackend = stubBackend;

/**
 * Inject the real backend. The web/extension build calls this with the
 * luxfi/crypto WASM module wrapper; native calls it with the UniFFI
 * binding. Idempotent — last call wins.
 */
export function setBackend(backend: CryptoBackend): void {
  active = backend;
}

/** The active crypto backend (stub until `setBackend` is called). */
export function crypto(): CryptoBackend {
  return active;
}

/** True once a real backend is bound and loaded. */
export function isCryptoAvailable(): boolean {
  return active.available;
}

// Convenience re-exports so callers can `import { mldsa65 } from "@luxwallet/crypto"`.
// They read through the active backend each call, so they pick up setBackend.
export const mldsa65: Signer = {
  keypair: () => active.mldsa65.keypair(),
  fromSeed: (s: Uint8Array) => active.mldsa65.fromSeed(s),
  sign: (sk: Uint8Array, m: Uint8Array) => active.mldsa65.sign(sk, m),
  verify: (pk: Uint8Array, m: Uint8Array, sig: Uint8Array) => active.mldsa65.verify(pk, m, sig),
};

export const slhdsa192s: Signer = {
  keypair: () => active.slhdsa192s.keypair(),
  fromSeed: (s: Uint8Array) => active.slhdsa192s.fromSeed(s),
  sign: (sk: Uint8Array, m: Uint8Array) => active.slhdsa192s.sign(sk, m),
  verify: (pk: Uint8Array, m: Uint8Array, sig: Uint8Array) => active.slhdsa192s.verify(pk, m, sig),
};

export const mlkem768: Kem = {
  keypair: () => active.mlkem768.keypair(),
  encapsulate: (pk: Uint8Array): Promise<Encapsulation> => active.mlkem768.encapsulate(pk),
  decapsulate: (sk: Uint8Array, ct: Uint8Array): Promise<Uint8Array> =>
    active.mlkem768.decapsulate(sk, ct),
};

export const secp256k1: Signer = {
  keypair: () => active.secp256k1.keypair(),
  fromSeed: (s: Uint8Array) => active.secp256k1.fromSeed(s),
  sign: (sk: Uint8Array, m: Uint8Array) => active.secp256k1.sign(sk, m),
  verify: (pk: Uint8Array, m: Uint8Array, sig: Uint8Array) => active.secp256k1.verify(pk, m, sig),
};

export const ed25519: Signer = {
  keypair: () => active.ed25519.keypair(),
  fromSeed: (s: Uint8Array) => active.ed25519.fromSeed(s),
  sign: (sk: Uint8Array, m: Uint8Array) => active.ed25519.sign(sk, m),
  verify: (pk: Uint8Array, m: Uint8Array, sig: Uint8Array) => active.ed25519.verify(pk, m, sig),
};

export type { KeyPair };
