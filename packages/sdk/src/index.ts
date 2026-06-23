/**
 * @luxwallet/sdk — the umbrella.
 *
 * A thin barrel re-exporting the independent Lux Wallet modules under
 * namespaces (so symbols that repeat across modules — `Scheme`,
 * `BuilderStatus` — never collide). Import a module flat via its subpath
 * (`@luxwallet/sdk/chains`) or the standalone package (`@luxwallet/chains`)
 * when you want tree-shaking down to one module.
 *
 *   import { chains, rpc, crypto, keyring, tx } from "@luxwallet/sdk";
 *   chains.getChain(96369);
 *   const url = rpc.getRpcUrl(96369);
 *
 * CONNECT / SIWx is a SEPARATE module: `@luxwallet/connect` (npm) /
 * `github.com/luxwallet/connect/go`. It is an OPTIONAL peer dependency of
 * this umbrella — install it alongside and import it directly:
 *
 *   import { ... } from "@luxwallet/connect";
 *
 * It is intentionally NOT re-exported here: connect ships its own release
 * cadence and we do not duplicate or vendor it.
 */
export * as chains from "@luxwallet/chains";
export * as rpc from "@luxwallet/rpc";
export * as crypto from "@luxwallet/crypto";
export * as keyring from "@luxwallet/keyring";
export * as tx from "@luxwallet/tx";
