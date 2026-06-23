# @luxwallet/brand

The ONE source of white-label truth for the Lux Wallet stack. MIT, zero
dependencies.

A brand is plain runtime config — identity, IAM endpoint, gateway host, theme
tokens, and the chains to enable. Any org white-labels the wallet by shipping a
`brand.json`; nobody forks a package.

```ts
import { getBrand, loadBrandConfig, defineBrand, LUX_BRAND } from "@luxwallet/brand";

// 1. Load the deployment's /brand.json once, before first render.
await loadBrandConfig();          // fetches /brand.json, merges over the singleton

// 2. Everything reads the live brand.
const b = getBrand();
b.name;                            // "Lux Wallet"
b.gateway.rpcBaseUrl;              // "https://api.lux.network"

// 3. Author a brand in code when you don't want a JSON file.
const acme = defineBrand({
  id: "acme",
  name: "Acme Wallet",
  shortName: "Acme",
  domain: "acme.example",
  iam: { serverUrl: "https://acme.id", clientId: "acme-wallet", scopes: ["openid", "profile", "email"] },
  gateway: { rpcBaseUrl: "https://api.acme.example" },
  theme: { accent1: "#FF0000" },
  chains: ["lux-c-mainnet"],
});
```

## Runtime model

1. A deployment ships `/brand.json` (its overrides over a base brand) — a K8s
   ConfigMap mount or a static file.
2. The host calls `loadBrandConfig()` before first render.
3. Code reads the `brand` singleton, which `loadBrandConfig` mutates IN PLACE so
   already-imported references see the live brand.
4. Theme tokens become CSS custom properties (`--lw-<token>`) on web; native
   reads `getBrand().theme` directly.

`loadBrandConfig` FAILS SAFE: any fetch failure keeps the current (default Lux)
brand so local/offline boots still work.

## Schema

`brand.schema.json` (JSON Schema draft-07) validates a `brand.json`. Regenerate
it from the TypeScript type with `pnpm --filter @luxwallet/brand emit`.

## Secrets

A brand is PUBLIC config. IAM client secrets, WalletConnect ids, and API keys
never live in a brand — they come from KMS, injected server-side.

## Wiring into RPC

`@luxwallet/rpc` reads the gateway from a brand without depending on this
package:

```ts
import { getRpcUrl, rpcConfigFromBrand } from "@luxwallet/rpc";
import { getBrand } from "@luxwallet/brand";

getRpcUrl(96369, rpcConfigFromBrand(getBrand()));
```
