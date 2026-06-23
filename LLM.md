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
  `/keyring`, `/tx`) and independently usable.
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
