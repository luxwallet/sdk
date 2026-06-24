import { describe, expect, it } from "vitest";
import { allChains, chainsByFamily, getChain } from "./index.js";

describe("@luxwallet/chains registry", () => {
  it("seeds the Lux C-Chain mainnet/testnet/DEX ids", () => {
    expect(getChain(96369)?.id).toBe("lux-c-mainnet");
    expect(getChain(96368)?.id).toBe("lux-c-testnet");
    expect(getChain(96370)?.id).toBe("lux-dex");
  });

  it("seeds every ecosystem L1 with the pinned EVM chain ids", () => {
    const expected: Record<number, string> = {
      200200: "zoo-mainnet",
      200201: "zoo-testnet",
      36963: "hanzo-mainnet",
      36964: "hanzo-testnet",
      36911: "spc-mainnet",
      36910: "spc-testnet",
      494949: "pars-mainnet",
      7071: "pars-testnet",
    };
    for (const [chainId, id] of Object.entries(expected)) {
      expect(getChain(Number(chainId))?.id).toBe(id);
    }
  });

  it("looks up by registry id and by EIP-155 id equivalently", () => {
    expect(getChain("lux-c-mainnet")).toBe(getChain(96369));
  });

  it("returns undefined for unknown chains", () => {
    expect(getChain(999999)).toBeUndefined();
    expect(getChain("nope")).toBeUndefined();
  });

  it("registers the non-EVM Lux families with builderStatus todo", () => {
    for (const id of ["lux-x-mainnet", "lux-p-mainnet", "lux-q-mainnet", "lux-z-mainnet"]) {
      const c = getChain(id);
      expect(c, id).toBeDefined();
      expect(c?.builderStatus).toBe("todo");
      expect(c?.evmChainId).toBeUndefined();
    }
  });

  it("maps each non-EVM family to its VM family", () => {
    expect(getChain("lux-x-mainnet")?.family).toBe("utxo");
    expect(getChain("lux-p-mainnet")?.family).toBe("platform");
    expect(getChain("lux-q-mainnet")?.family).toBe("pqevm");
    expect(getChain("lux-z-mainnet")?.family).toBe("zk");
  });

  it("marks every EVM chain builder ready and gives it an rpcRoute == chain id", () => {
    for (const c of chainsByFamily("evm")) {
      expect(c.builderStatus).toBe("ready");
      expect(c.evmChainId).toBeDefined();
      expect(c.rpcRoute).toBe(String(c.evmChainId));
      expect(c.networkId).toBe(c.evmChainId);
    }
  });

  it("has unique registry ids and unique EVM chain ids", () => {
    const ids = allChains().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const evmIds = allChains().flatMap((c) => (c.evmChainId === undefined ? [] : [c.evmChainId]));
    expect(new Set(evmIds).size).toBe(evmIds.length);
  });

  it("every chain carries a bip44 path and a native asset", () => {
    for (const c of allChains()) {
      // A valid BIP-32 derivation rooted at a hardened purpose (BIP-44/49/84/86
      // — Bitcoin uses BIP-84 native segwit, not BIP-44).
      expect(c.bip44.path).toMatch(/^m\/\d+'\//);
      expect(c.nativeAsset.decimals).toBeGreaterThan(0);
      expect(c.nativeAsset.symbol.length).toBeGreaterThan(0);
    }
  });
});
