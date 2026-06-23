# @luxwallet/sdk

The unified **Lux Wallet** shared core. One TypeScript codebase that the web
wallet, the browser extension, and (via WASM/UniFFI) the native iOS/Android
wallets build on — so chain metadata, RPC routing, crypto, the account model,
and tx construction are defined **once**.

MIT licensed. pnpm workspace.

## Architecture

`@luxwallet/sdk` is an **umbrella** that re-exports independent modules. Use
the umbrella for convenience, or depend on a single module directly for
tighter trees.

| Package | What it is | Status |
|---|---|---|
| [`@luxwallet/chains`](packages/chains) | Chain registry — ONE source of truth. Emits `chains.json` for native consumers. | real |
| [`@luxwallet/rpc`](packages/rpc) | Gateway RPC client: `https://<gateway>/v1/rpc/<chainId>`. | real |
| [`@luxwallet/crypto`](packages/crypto) | Facade over the `luxfi/crypto` C core (classical + PQ). | interface real, impl pending WASM/native bind |
| [`@luxwallet/keyring`](packages/keyring) | Account model + keystore (classical + ML-DSA-65 + SLH-DSA recovery). | store real, crypto calls pending |
| [`@luxwallet/tx`](packages/tx) | Per-VM tx builders. EVM real (viem); P/X/UTXO/SVM stubbed. | EVM real, rest `todo` |
| [`@luxwallet/sdk`](packages/sdk) | Umbrella barrel re-exporting the modules. | real |

### connect / SIWx is a separate module

Wallet connection + Sign-In-With-X lives in its **own repo**,
[`luxwallet/connect`](https://github.com/luxwallet/connect) — npm
`@luxwallet/connect`, Go `github.com/luxwallet/connect/go`. This SDK does
**not** duplicate or vendor it. Install it alongside and import it directly:

```sh
pnpm add @luxwallet/sdk @luxwallet/connect
```

```ts
import { chains, rpc, tx } from "@luxwallet/sdk";
import { /* SIWx */ } from "@luxwallet/connect";
```

## Cross-language plan

The same primitives reach native wallets without a second implementation:

- **JS (web + extension)**: `luxfi/crypto` compiled to **WASM**, wrapped to
  the `@luxwallet/crypto` `CryptoBackend` interface and injected via
  `setBackend`.
- **Native (iOS/Android)**: `luxfi/crypto` bound via **UniFFI** over its C
  ABI, exposing the identical `CryptoBackend`.
- **Chain data**: `@luxwallet/chains` emits `chains.json`; Kotlin/Swift read
  that artifact so every platform keys on the same chain ids.
- **UI** lives in a separate repo, `luxwallet/ui`, built on
  [`@hanzo/gui`](https://github.com/hanzoai). This SDK is headless.

The crypto used by the wallet is the **same** `luxfi/crypto` the chain uses —
never `@noble/post-quantum`, never a hand-rolled precompile wire format. See
[`packages/crypto/LLM.md`](packages/crypto/LLM.md).

## Develop

```sh
pnpm install              # workspace install
pnpm -r typecheck         # tsc --build across all packages (project refs)
pnpm -r test              # vitest across all packages
pnpm verify               # license/dep hygiene gate (no @noble PQ, no GPL)
pnpm chains:emit          # regenerate packages/chains/chains.json
```

Each package is `@luxwallet/<name>`, MIT, ESM, with a `react-native` +
`browser`/`default` export condition so native runtimes can consume it.

## Status

Scaffold. The registry, RPC routing, and the EVM unsigned-tx builder are
real and tested. The crypto facade and keyring define exact interfaces with
stubs that throw `"not yet bound"`; the WASM/native crypto binding and the
non-EVM tx builders are tracked in each package's `LLM.md`.
