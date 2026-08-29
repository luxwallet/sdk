import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allChains } from "./index.js";

/**
 * chains.json must be what the registry says.
 *
 * The file is generated from CHAINS and committed, because Kotlin and Swift
 * read it — they cannot import TypeScript. So it is the same list twice, and
 * the second copy went stale: fifteen chains against the registry's
 * thirty-six, missing every external one. Mobile saw no Bitcoin, no Solana,
 * no Cardano and no EVM L2, while the web saw all of them, and nothing
 * anywhere reported a disagreement.
 *
 * The generator is not the problem — it serialises CHAINS verbatim. Nobody
 * ran it. This test is what makes not running it visible.
 */
describe("the emitted registry", () => {
  const emitted = JSON.parse(
    readFileSync(fileURLToPath(new URL("../chains.json", import.meta.url)), "utf8"),
  ) as { chains: { id: string }[] };

  it("holds every chain the registry holds", () => {
    const inSource = allChains().map((c) => c.id).sort();
    const inFile = emitted.chains.map((c) => c.id).sort();
    expect(inFile).toEqual(inSource);
  });

  it("is byte-identical to what the generator would write", () => {
    // Not just the same ids — the same records. A field added to a chain and
    // not re-emitted is the same failure one level down, and the platforms
    // reading this file would silently lack it.
    expect(emitted.chains).toEqual(JSON.parse(JSON.stringify(allChains())));
  });

  it("carries the external chains, which is what went missing", () => {
    const ids = new Set(emitted.chains.map((c) => c.id));
    for (const id of ["bitcoin", "solana", "cardano", "ethereum", "base", "polkadot", "xrp"]) {
      expect(ids.has(id), `${id} is absent from chains.json`).toBe(true);
    }
  });
});
