# @luxwallet/crypto — implementation notes

This package is a **facade**. The interface in `src/types.ts` is final and
exact. The implementation is a stub that throws `"not yet bound"` until a
real backend is injected via `setBackend`. Read this before binding it.

## (a) Bind luxfi/crypto — NOT @noble/post-quantum

The PQ primitives (ML-DSA-44/65/87, SLH-DSA, ML-KEM-768) and the classical
ones MUST come from the **luxfi/crypto C core**, the same implementation the
chain uses. One library, one implementation — wallet bytes are
byte-identical to consensus bytes.

- **Source**: `~/work/lux/crypto`. C ABI under `bindings/cabi`
  (`main.go` exposes `libluxcrypto`), Rust under `bindings/rust`, an
  existing Node/koffi binding under `bindings/typescript` (package
  `luxcrypto`, exporting `mldsa65`, `mlkem768`).
- **Web / extension**: compile luxfi/crypto to **WASM** and wrap it to the
  `CryptoBackend` shape, then `setBackend(wasmBackend)`. (The koffi binding
  in `bindings/typescript` is Node-FFI only; the browser/extension path
  needs WASM.)
- **Native (iOS/Android)**: bind via **UniFFI** over the same C ABI; expose
  the identical `CryptoBackend`. See root LLM.md cross-language plan.

**DO NOT** add `@noble/post-quantum` (or any pure-JS PQ lib). `verify-clean`
fails the build if it appears here. Reasons: (1) we need bit-exact agreement
with the chain's FIPS-204 packing and context strings; (2) a second
implementation is a second thing to audit and a second place to drift.

## (b) The on-chain ML-DSA precompile wire format

The signer's output must compose into the input the **on-chain ML-DSA
verify precompile** expects. The authoritative layout is in
`~/work/lux/crypto/precompile/mldsa.go`:

- One precompile **address per mode** (no in-band mode byte):
  - `0x…0110` ML-DSA-44, `0x…0111` ML-DSA-65, `0x…0112` ML-DSA-87.
- Input layout for each (from `mldsaVerify.Run`):

  ```
  input = pubKey(pubKeySize) ‖ sig(sigSize) ‖ message(rest)
  ```

  i.e. **public key first (fixed size), then signature (fixed size), then
  the variable-length message**. `pubKeySize`/`sigSize` are the FIPS-204
  packed sizes — ML-DSA-65 → pk **1952**, sig **3309** (see `Sizes` in
  `types.ts`, sourced from `luxfi/utxo/mldsafx/credential.go`).

> WARNING — the audit trap. `lux/wallet/pkgs/wallet/src/features/wallet/pq`
> framed the precompile input as
> `mode(1) ‖ pubkey ‖ msgLen(32 BE) ‖ sig ‖ msg`. That is **WRONG**: the
> live precompile selects mode by address (no mode byte), expects
> **pubkey then sig then msg** (no length prefix), and rejects anything
> else. Do not port that module. Build inputs to match `mldsa.go`.

For **UTXO/credential** verification (X/P chains) the shape is different
again: an `MLDSACredential` carries N signatures matching N `OutputOwners`,
where owners are **full public keys** (1952 B for ML-DSA-65), not 20-byte
hash addresses — see `luxfi/utxo/mldsafx`. That path is `@luxwallet/tx`'s
concern (builderStatus `todo`); this package only produces raw signatures.

### Signing context

The wallet account signer signs FIPS-204 "pure" with the Lux context string
`LUX/WALLET/TX/V1` over a **48-byte (384-bit) digest** (see
`lux/sdk/wallet/account/pq_account.go`). Match that context and digest size
exactly, or signatures verify locally but fail against chain expectations.

## (c) Lock with shared KAT vectors

Generate `vectors.json` (known-answer tests) **from the Go side**
(`luxfi/crypto`) and commit it here. The TS/WASM and native backends must
reproduce every vector:

- ML-DSA-65: seed (xi) → (pk, sk); (sk, msg, ctx) → sig; (pk, msg, ctx, sig)
  → true. Include the `LUX/WALLET/TX/V1` context cases.
- SLH-DSA-192s, ML-KEM-768, secp256k1, ed25519: analogous.
- AccountID: (chainID, scheme, pubkey) → 48-byte cSHAKE-256 id, matching
  `lux/sdk/wallet/account/cshake.go` (`N="LUX_ACCOUNT_V1"`,
  `S="LUX/WALLET/ACCOUNT_ID/V1"`).

A test here loads `vectors.json` and asserts the bound backend matches.
Until the WASM backend lands, that test is skipped (no backend bound).

## Status

- [x] Exact `CryptoBackend` interface + sizes/scheme constants.
- [x] Stub backend that throws `not yet bound`; `setBackend` injection.
- [ ] WASM build of luxfi/crypto + browser/extension backend wrapper.
- [ ] UniFFI native backend.
- [ ] `vectors.json` KAT from Go + conformance test.
