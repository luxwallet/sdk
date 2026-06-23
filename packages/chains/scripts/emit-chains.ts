/**
 * Emit chains.json — the cross-language artifact.
 *
 * Native clients (Kotlin/Swift) cannot import the TS registry, so they
 * read this generated JSON. TS stays the single source of truth: this
 * script serializes `CHAINS` verbatim. Run `pnpm chains:emit` after any
 * registry edit and commit the result.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CHAINS } from "../src/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "chains.json");

const payload = {
  $schema: "https://luxwallet.org/schema/chains.v1.json",
  version: 1,
  chains: CHAINS,
};

writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
// eslint-disable-next-line no-console
console.log(`wrote ${CHAINS.length} chains -> ${out}`);
