# LLM.md — @luxwallet/sdk

Guidance for AI agents working in this repo. Per-package implementation
notes live in each `packages/<name>/LLM.md`; the hard parts are the crypto
and tx packages.

## What this repo is

The unified Lux Wallet **shared core**, headless. An umbrella package
(`@luxwallet/sdk`) re-exports independent modules. The web wallet, the
browser extension, and the native wallets (via WASM/UniFFI) all consume
these modules so wallet logic exists once.

## Architecture (decided — do not redesign)

- **Umbrella + modules.** `@luxwallet/sdk` is a thin barrel. Each module is
  independently published (`@luxwallet/chains`, `/rpc`, `/crypto`,
  `/keyring`, `/tx`, `/store`) and independently usable.
- **connect/SIWx is separate.** Lives in `luxwallet/connect` (npm
  `@luxwallet/connect`, Go `github.com/luxwallet/connect/go`). DEPEND on it,
  never duplicate. It is documented in the umbrella and README as a sibling
  install; it is intentionally NOT a hard dependency here (and is currently
  unpublished, so adding it to a manifest would break `pnpm install`).
- **One source of truth for chains.** `@luxwallet/chains` owns chain
  metadata and emits `chains.json` so native Kotlin/Swift read identical
  data. Do not hardcode chain ids elsewhere — import from `@luxwallet/chains`.
- **One way to reach a chain.** `@luxwallet/rpc`:
  `https://<gateway>/v1/rpc/<route>`, default gateway `api.hanzo.ai`, brand
  override + per-chain override. No `/api/` prefix, no `/v2`.
- **One crypto implementation.** `@luxwallet/crypto` is a facade over the
  `luxfi/crypto` C core (WASM for JS, UniFFI for native). NEVER
  `@noble/post-quantum`. NEVER reuse the precompile wire format from
  `lux/wallet/.../features/wallet/pq` (audited WRONG).

## @luxwallet/store — the pre-composed headless wallet

The one wallet store the desktops consume (create / import / reveal / balance /
send). It replaces the npm-deprecated `@luxwallet/core` (published in error from
a parallel monorepo); consumers swap the import `@luxwallet/core` →
`@luxwallet/store` with no code change — the public API is identical. It is a
thin zustand composition over pure modules; nothing brand-specific lives inside.

Injected seams (the ONLY coupling to the outside — via `WalletEngineConfig`):

- `crypto: () => Promise<CryptoEngine>` — a minimal **structural** interface
  (`keccak256`, `keys.deriveSecp256k1`, `keys.serviceIdentity`, `secp256k1`
  get/sign/recover). The existing `LuxCrypto` WASM loader satisfies it
  structurally with zero changes, so the store carries NO crypto dependency and
  never imports `@luxfi/crypto`.
- `keychain: Keychain` — secret-at-rest seam. `tauriKeychain(bridge)` over the
  host `secure_storage_*` commands; `memoryKeychain()` for browser dev/tests.
- `chains: ChainProvider` — brand chain lookup + `RpcClientLike` (satisfied by
  `@luxwallet/rpc`'s `RpcClient`).

Field invariants (wallets exist in the field — breaking these bricks them):

- persist key defaults to `lux-wallet`; the persisted slice is
  `accounts` / `selectedAccountId` / `selectedChainId` ONLY. Secrets NEVER hit
  persisted state — they live only behind the keychain seam.
- keychain keys are exactly `luxwallet:<id>:mnemonic` / `luxwallet:<id>:privateKey`.
- EVM keys: BIP-44 `m/44'/60'/0'/0/0` secp256k1, EIP-55 checksummed addresses;
  PQ identity via `serviceIdentity(mnemonic, 'wallet/0')`.
- `sendEvm` is an EIP-1559 (type-2) tx with recid normalization (sig[64] may be
  27/28 or 0/1) and a recovered-signer self-check that MUST pass before broadcast.

Internal modules are orthogonal and pure where possible: `hex` (toHex/fromHex),
`account` (mnemonic/pk → derived account + secrets, pure), `evm` (getBalance +
signAndSendEvm, pure), `keychain` (the secret seam), `store` (zustand `persist`
composition only — no `devtools`). SIWx is NOT here; it lives in
`@luxwallet/connect`. Deps: `@luxwallet/chains` (types); peers `ethers` 6 +
`zustand` 5 (`react` is zustand's own optional peer, provided by the app).

## Cross-language plan

| Layer | JS (web/ext) | Native (iOS/Android) |
|---|---|---|
| Crypto | `luxfi/crypto` → WASM → `setBackend` | `luxfi/crypto` → UniFFI → `setBackend` |
| Chains | import `@luxwallet/chains` | read emitted `chains.json` |
| UI | `@hanzo/gui` (separate `luxwallet/ui` repo) | native, same design tokens |

## Toolchain / conventions

- pnpm workspace, Node ≥ 20, ESM only.
- TypeScript **project references** (`tsc --build`) — cross-package types
  resolve through each dep's emitted `.d.ts`. `pnpm -r typecheck` builds the
  graph in order. Test files are excluded from the composite build and
  typechecked by vitest at run time.
- Per-package `tsconfig.json` extends `tsconfig.base.json`.
- vitest per package. Tests assert the REAL parts (chains lookup, rpc URL
  building, evm unsigned-tx shape, keyring bookkeeping, AccountID framing).
  Stubs that throw `"not yet bound"` / `"builder todo"` are asserted to throw.
- Export conditions: `react-native` + `browser`/`default` so native runtimes
  consume the same packages.

## Hygiene gate

`pnpm verify` (`scripts/verify-clean.mjs`) fails the build if:
- `@luxwallet/crypto` depends on `@noble/post-quantum` (or any `@noble/*`
  crypto lib), or has any runtime dependency at all (it is a dependency-free
  facade);
- any package pulls a GPL/AGPL dep.

Note: viem (in `@luxwallet/tx`) transitively uses `@noble/curves` +
`@noble/hashes` for **classical EVM** crypto — that is allowed (MIT, not PQ,
not in `@luxwallet/crypto`). Only `@noble/post-quantum` is forbidden.

## What is real vs stubbed

REAL: chain registry + `chains.json` emit; gateway RPC URL resolution +
minimal EVM JSON-RPC client; EVM unsigned EIP-1559 tx builder (viem);
keyring account store + BIP-44 path derivation + AccountID byte-framing;
the crypto `CryptoBackend` interface + size/scheme constants; the umbrella
barrel.

STUBBED (interface exact, impl throws): all `@luxwallet/crypto` primitives
until a WASM/native backend is injected; keyring keypair derivation,
cSHAKE AccountID hashing, and keystore seal/unseal (go through the crypto
backend); the P/X/UTXO/SVM tx builders.

## Rules

1. Update the relevant `LLM.md`, never create scratch summary files.
2. Import chain data from `@luxwallet/chains`; never hardcode ids.
3. All crypto through `@luxwallet/crypto` → `luxfi/crypto`. No second crypto
   lib, no `@noble/post-quantum`.
4. Builders emit UNSIGNED bytes only; signing is keyring + crypto.
5. Keep `builderStatus` honest — `ready` only with a tested round-trip.
