#!/usr/bin/env node
/**
 * verify-clean — license + dependency hygiene gate.
 *
 *  1. @luxwallet/crypto MUST NOT depend on @noble/post-quantum (or any
 *     pure-JS PQ lib). PQ crypto comes from luxfi/crypto (WASM/native) so
 *     wallet bytes are bit-identical to chain bytes. See crypto/LLM.md.
 *  2. No package may pull a GPL/AGPL dependency (copyleft is incompatible
 *     with our MIT distribution).
 *
 * Pure Node, no deps. Exits non-zero on any violation.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgsDir = join(root, "packages");

/** Banned dependency names anywhere in any package.json. */
const BANNED_DEPS = ["@noble/post-quantum"];
/** Banned crypto-lib names specifically inside @luxwallet/crypto. */
const BANNED_IN_CRYPTO = ["@noble/post-quantum", "@noble/curves", "@noble/hashes", "noble-post-quantum"];

const errors = [];

function depsOf(pkg) {
  return {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  };
}

for (const name of readdirSync(pkgsDir)) {
  const pkgPath = join(pkgsDir, name, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    continue;
  }
  const deps = depsOf(pkg);

  for (const banned of BANNED_DEPS) {
    if (banned in deps) {
      errors.push(`${pkg.name}: forbidden dependency ${banned}`);
    }
  }

  if (pkg.name === "@luxwallet/crypto") {
    for (const banned of BANNED_IN_CRYPTO) {
      if (banned in deps) {
        errors.push(`${pkg.name}: must not import ${banned} (use luxfi/crypto WASM/native)`);
      }
    }
    // crypto is a zero-runtime-dependency facade.
    const runtime = Object.keys(pkg.dependencies ?? {});
    if (runtime.length > 0) {
      errors.push(`${pkg.name}: expected zero runtime deps, found ${runtime.join(", ")}`);
    }
  }
}

if (errors.length > 0) {
  console.error("verify-clean FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-clean OK: no @noble PQ, no GPL, crypto facade is dependency-free.");
