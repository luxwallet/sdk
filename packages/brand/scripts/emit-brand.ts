/**
 * Emit a baked brand.<id>.json for a native installer build.
 *
 * The web wallet loads /brand.json at RUNTIME (a signed installer cannot —
 * it is immutable), so a native build BAKES the brand at build time. This
 * script writes the selected brand as a self-contained JSON that the desktop,
 * extension, iOS, and Android release pipelines copy into their bundle and
 * read through the same `loadBrandConfig()` path (from a bundled file URL
 * instead of the network).
 *
 * It also resolves the brand's default chain (chains[0], a registry id like
 * "lux-c-mainnet") to its EVM chain id (96369) via @luxwallet/chains, so the
 * native shells get a concrete `defaultEvmChainId` to bake without hardcoding
 * any id. @luxwallet/chains is the ONE source of chain truth; this script
 * never invents an id.
 *
 * Usage:
 *   tsx scripts/emit-brand.ts <brandId> [outDir]
 *   tsx scripts/emit-brand.ts lux ./dist
 *   BRAND=hanzo tsx scripts/emit-brand.ts
 *
 * Writes <outDir>/brand.json (the bundle's brand) AND prints a small set of
 * key=value lines to stdout so a CI step can `eval`/`>> $GITHUB_ENV` the baked
 * scalars (brand id, app name, gateway, default chain id, default EVM id).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { getChain } from "@luxwallet/chains";
import { defaultChainId, getBrandById, type BrandConfig } from "../src/index.js";

const brandId = process.argv[2] ?? process.env.BRAND ?? "lux";
const outDir = resolve(process.argv[3] ?? process.env.BRAND_OUT_DIR ?? ".");

const brand: BrandConfig = getBrandById(brandId);

const defChainId = defaultChainId(brand); // registry id, e.g. "lux-c-mainnet"
const chain = getChain(defChainId);
if (!chain) {
  throw new Error(
    `@luxwallet/brand emit-brand: brand "${brandId}" default chain "${defChainId}" is not in @luxwallet/chains`,
  );
}
if (chain.evmChainId === undefined) {
  throw new Error(
    `@luxwallet/brand emit-brand: brand "${brandId}" default chain "${defChainId}" is non-EVM; native default chain must be EVM`,
  );
}

// The baked brand is the runtime brand verbatim PLUS the resolved EVM chain id
// so native shells need not import the registry. Web reads the brand fields;
// native reads defaultEvmChainId / gateway.rpcBaseUrl directly.
const baked = {
  $schema: "https://luxwallet.org/schema/brand.v1.json",
  ...brand,
  defaultChainId: defChainId,
  defaultEvmChainId: chain.evmChainId,
};

mkdirSync(outDir, { recursive: true });
const out = join(outDir, "brand.json");
writeFileSync(out, JSON.stringify(baked, null, 2) + "\n");

// Machine-readable scalars for CI (`emit-brand.ts lux | tee >> $GITHUB_ENV`).
const lines = [
  `BRAND_ID=${brand.id}`,
  `BRAND_NAME=${brand.name}`,
  `BRAND_SHORT_NAME=${brand.shortName}`,
  `BRAND_DOMAIN=${brand.domain}`,
  `BRAND_GATEWAY_RPC_BASE_URL=${brand.gateway.rpcBaseUrl}`,
  `BRAND_DEFAULT_CHAIN_ID=${defChainId}`,
  `BRAND_DEFAULT_EVM_CHAIN_ID=${chain.evmChainId}`,
  `BRAND_IAM_SERVER_URL=${brand.iam.serverUrl}`,
  `BRAND_IAM_CLIENT_ID=${brand.iam.clientId}`,
];
for (const l of lines) process.stdout.write(l + "\n");

const here = dirname(fileURLToPath(import.meta.url));
process.stderr.write(
  `wrote baked brand "${brand.id}" (default chain ${defChainId}=${chain.evmChainId}) -> ${out}` +
    ` [from ${join(here, "emit-brand.ts")}]\n`,
);
