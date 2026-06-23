/**
 * Emit brand.schema.json — the JSON Schema for a brand.json file.
 *
 * Deployments author brand.json by hand (or via their config pipeline). This
 * schema gives editors validation/autocomplete and lets CI lint a brand.json
 * before it ships. The TypeScript `BrandConfig` in src/index.ts is the source
 * of truth; this schema mirrors it. Run `pnpm --filter @luxwallet/brand emit`
 * after changing the type and commit the result.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "brand.schema.json");

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://luxwallet.org/schema/brand.v1.json",
  title: "BrandConfig",
  description: "Runtime white-label brand config for the Lux Wallet stack.",
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "shortName", "domain", "iam", "gateway", "theme", "chains"],
  properties: {
    id: { type: "string", minLength: 1, description: "Stable brand id, e.g. 'lux'." },
    name: { type: "string", minLength: 1, description: "Display name, e.g. 'Lux Wallet'." },
    shortName: { type: "string", minLength: 1, description: "Short name, e.g. 'Lux'." },
    domain: { type: "string", minLength: 1, description: "Primary domain, e.g. 'lux.network'." },
    iam: {
      type: "object",
      additionalProperties: false,
      required: ["serverUrl", "clientId", "scopes"],
      properties: {
        serverUrl: { type: "string", format: "uri", pattern: "^https?://" },
        clientId: { type: "string", minLength: 1, description: "<org>-<app>, e.g. 'lux-wallet'." },
        scopes: { type: "array", minItems: 1, items: { type: "string" } },
      },
    },
    gateway: {
      type: "object",
      additionalProperties: false,
      required: ["rpcBaseUrl"],
      properties: {
        rpcBaseUrl: {
          type: "string",
          format: "uri",
          pattern: "^https?://",
          description: "Gateway base URL; RPC = <rpcBaseUrl>/v1/rpc/<chainId>.",
        },
      },
    },
    theme: {
      type: "object",
      description: "Theme token name -> color. Applied as CSS vars (--lw-<token>).",
      additionalProperties: { type: "string" },
    },
    chains: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
      description: "Chain ids (from @luxwallet/chains) to enable.",
    },
    logo: { type: "string", description: "Optional logo URL." },
  },
} as const;

writeFileSync(out, JSON.stringify(schema, null, 2) + "\n");
// eslint-disable-next-line no-console
console.log(`wrote brand JSON schema -> ${out}`);
