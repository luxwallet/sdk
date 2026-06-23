# @luxwallet/keyring — implementation notes

Reference impl (Go, working): `~/work/lux/sdk/wallet`
- `pq_wallet.go` — the in-memory PQ account store (modeled by `Keyring`).
- `account/pq_account.go` — ML-DSA-65 account derivation + Sign/Verify.
- `account/recovery.go` — SLH-DSA-192s recovery accounts (branch 2').
- `account/cshake.go` — AccountID + seed-expansion cSHAKE framing.
- `account/scheme.go` — `WalletSchemeID` / `RecoverySchemeID` byte values.

## What's real here

- `Keyring` — add/get/remove/list, refusing duplicate AccountIDs. Matches
  PQWallet semantics. No crypto needed; fully tested.
- `derivationPathFor` — BIP-44 paths: EVM (coinType 60), ML-DSA branch
  (`m/44'/9000'/<net>'/0'/<role>'/<idx>'`), SLH-DSA recovery branch (2').
- `accountIdMessage` — the exact `u32be(networkId) ‖ u8(scheme) ‖ pubkey`
  framing fed to cSHAKE.

## What's stubbed (throws "not yet bound" via @luxwallet/crypto)

1. **Seed expansion + keygen** (`deriveAccount`). The Go path is:
   `child_seed = BIP-32 walk` → `ξ = cSHAKE-256(N="LUX_PQ_KEYGEN_V1",
   S="LUX/WALLET/<ROLE>/V1", child_seed, 32)` → `ML-DSA-65.KeyGen(ξ)`.
   Today `deriveAccount` calls `signer.fromSeed(masterSeed)` as a binding
   placeholder. **TODO**: add BIP-32 + role-bound cSHAKE to the crypto
   backend and do the full walk so derivations match the Go vectors.

2. **AccountID cSHAKE** (`deriveAccountId`). Must be **cSHAKE-256** with
   `N="LUX_ACCOUNT_V1"`, `S="LUX/WALLET/ACCOUNT_ID/V1"`, outLen 48 — NOT
   bare SHAKE256. The crypto backend currently exposes only `shake256`;
   **TODO**: add `cshake256(n, s, msg, outLen)` to `CryptoBackend` (the
   luxfi/crypto core already has cSHAKE) and call it here. Lock against the
   Go output via the shared `vectors.json` KAT (see crypto LLM.md).

3. **Keystore seal/unseal** (`sealAccount`/`unsealAccount`). **TODO**:
   argon2id KDF + XChaCha20-Poly1305 AEAD over the secret key, via
   @luxwallet/crypto primitives only. No second crypto library.

## Hard rules

- All crypto goes through `@luxwallet/crypto` (→ luxfi/crypto). Never import
  `@noble/*` or any other crypto lib here.
- ML-DSA-65 is the production scheme (0x42). SLH-DSA-192s (0x62) is recovery
  only and never on the hot signing path — keep the type boundary (separate
  role + branch) so a recovery key cannot be used as a hot key.
- AccountID is bound to `networkId`, so the same key on two networks yields
  two AccountIDs. Do not drop the networkId from the framing.
