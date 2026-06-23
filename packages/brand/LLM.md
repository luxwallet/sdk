# LLM.md — @luxwallet/brand

The ONE source of white-label brand truth (MIT, runtime is **zero-dep**).

## Two consumption modes (one mechanism)

1. **Web / extension runtime** — a deployment ships `/brand.json`; the host
   calls `loadBrandConfig()` once before first render; everything reads the
   `brand` singleton (mutated in place). `loadBrandConfig` fails safe to the
   default Lux brand.
2. **Native installer bake** — a signed installer is immutable, so the brand is
   baked at build time. `scripts/emit-brand.ts` selects a built-in brand by id
   (`BRANDS` / `getBrandById`) and writes a self-contained `brand.json` that the
   desktop / extension / iOS / Android release pipelines copy into their bundle
   and read through the SAME `loadBrandConfig()` path (from a bundled file URL).

Both paths read the same `BrandConfig`. Never add a second brand config format.

## Built-in brands

`LUX_BRAND`, `HANZO_BRAND`, `ZOO_BRAND`, exposed as `BRANDS` (keyed by id) and
`getBrandById(id)` (throws on unknown id). `defaultChainId(brand)` = the FIRST
entry of `brand.chains` (the install default), e.g. lux → `lux-c-mainnet`.

## emit-brand (the native-baking tool)

`pnpm --filter @luxwallet/brand emit:brand <brandId> [outDir]` (or
`BRAND=<id>`). Resolves `defaultChainId(brand)` to its EVM chain id via
`@luxwallet/chains` (a **devDependency** — used only by this build-time script,
so the runtime stays zero-dep and never hardcodes EVM ids). Writes
`<outDir>/brand.json` (brand verbatim + `defaultChainId` + `defaultEvmChainId`)
and prints `BRAND_*=...` lines to stdout for CI to append to `$GITHUB_ENV`:

```
BRAND_ID, BRAND_NAME, BRAND_SHORT_NAME, BRAND_DOMAIN,
BRAND_GATEWAY_RPC_BASE_URL, BRAND_DEFAULT_CHAIN_ID, BRAND_DEFAULT_EVM_CHAIN_ID,
BRAND_IAM_SERVER_URL, BRAND_IAM_CLIENT_ID
```

Verified mapping: lux→96369, hanzo→36963, zoo→200200 (from `@luxwallet/chains`).

The native release workflows (each shell's `.github/workflows/release.yml`)
have a `BRAND` matrix axis (lux|hanzo|zoo) and run emit-brand to bake the logo
+ default chain per artifact.

## Rules

1. Runtime `index.ts` stays dependency-free (the hygiene gate `pnpm verify`
   enforces the crypto facade is dep-free; keep brand clean too). `@luxwallet/
   chains` is `devDependencies` only.
2. Never hardcode an EVM chain id — resolve via `@luxwallet/chains`.
3. Secrets never live in a brand — a brand is PUBLIC config.
4. After changing `BrandConfig`, regenerate `brand.schema.json` (`pnpm emit`).
