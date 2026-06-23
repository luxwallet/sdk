import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BrandConfig,
  BRANDS,
  HANZO_BRAND,
  LUX_BRAND,
  ZOO_BRAND,
  brand,
  brandCssVarName,
  defaultChainId,
  defineBrand,
  getBrand,
  getBrandById,
  loadBrandConfig,
} from "./index.js";

describe("@luxwallet/brand defineBrand", () => {
  it("returns a valid brand unchanged (round-trip)", () => {
    expect(defineBrand(LUX_BRAND)).toEqual(LUX_BRAND);
    expect(defineBrand(HANZO_BRAND)).toEqual(HANZO_BRAND);
  });

  it("ships valid LUX_BRAND and HANZO_BRAND defaults", () => {
    expect(LUX_BRAND.id).toBe("lux");
    expect(LUX_BRAND.iam.clientId).toBe("lux-wallet");
    expect(LUX_BRAND.gateway.rpcBaseUrl).toBe("https://api.lux.network");
    expect(HANZO_BRAND.id).toBe("hanzo");
    expect(HANZO_BRAND.gateway.rpcBaseUrl).toBe("https://api.hanzo.ai");
  });

  it("throws on empty id", () => {
    expect(() => defineBrand({ ...LUX_BRAND, id: "" })).toThrow(/id is required/);
  });

  it("throws when iam.serverUrl has no scheme", () => {
    expect(() =>
      defineBrand({ ...LUX_BRAND, iam: { ...LUX_BRAND.iam, serverUrl: "lux.id" } }),
    ).toThrow(/iam.serverUrl must be an absolute http\(s\) URL/);
  });

  it("throws when gateway.rpcBaseUrl has no scheme", () => {
    expect(() =>
      defineBrand({ ...LUX_BRAND, gateway: { rpcBaseUrl: "api.lux.network" } }),
    ).toThrow(/gateway.rpcBaseUrl must be an absolute http\(s\) URL/);
  });

  it("throws on an empty chain set", () => {
    expect(() => defineBrand({ ...LUX_BRAND, chains: [] })).toThrow(/chains must be a non-empty/);
  });

  it("throws on empty iam.scopes", () => {
    expect(() =>
      defineBrand({ ...LUX_BRAND, iam: { ...LUX_BRAND.iam, scopes: [] } }),
    ).toThrow(/iam.scopes must be a non-empty/);
  });
});

describe("@luxwallet/brand brandCssVarName", () => {
  it("prefixes tokens with --lw-", () => {
    expect(brandCssVarName("accent1")).toBe("--lw-accent1");
  });
});

describe("@luxwallet/brand built-in brand registry", () => {
  it("ships a valid ZOO_BRAND", () => {
    expect(ZOO_BRAND.id).toBe("zoo");
    expect(ZOO_BRAND.iam.clientId).toBe("zoo-wallet");
    expect(defineBrand(ZOO_BRAND)).toEqual(ZOO_BRAND);
  });

  it("registers lux/hanzo/zoo in BRANDS keyed by id", () => {
    expect(Object.keys(BRANDS).sort()).toEqual(["hanzo", "lux", "zoo"]);
    expect(BRANDS.lux).toBe(LUX_BRAND);
    expect(BRANDS.hanzo).toBe(HANZO_BRAND);
    expect(BRANDS.zoo).toBe(ZOO_BRAND);
  });

  it("getBrandById returns the brand for a known id", () => {
    expect(getBrandById("lux")).toBe(LUX_BRAND);
    expect(getBrandById("zoo")).toBe(ZOO_BRAND);
  });

  it("getBrandById throws loudly on an unknown id", () => {
    expect(() => getBrandById("nope")).toThrow(/unknown brand id "nope"/);
  });

  it("defaultChainId is the brand's first chain (the install default)", () => {
    expect(defaultChainId(LUX_BRAND)).toBe("lux-c-mainnet");
    expect(defaultChainId(HANZO_BRAND)).toBe("hanzo-mainnet");
    expect(defaultChainId(ZOO_BRAND)).toBe("zoo-mainnet");
  });
});

describe("@luxwallet/brand getBrand singleton", () => {
  it("defaults to the Lux brand", () => {
    expect(getBrand().id).toBe("lux");
    expect(getBrand()).toBe(brand);
  });
});

describe("@luxwallet/brand loadBrandConfig", () => {
  const original: BrandConfig = JSON.parse(JSON.stringify(brand));

  beforeEach(() => {
    // Restore the singleton in place before each case.
    Object.assign(brand, JSON.parse(JSON.stringify(original)));
    brand.iam = { ...original.iam };
    brand.gateway = { ...original.gateway };
    brand.theme = { ...original.theme };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges a partial brand.json over the singleton in place", async () => {
    const ref = getBrand();
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        id: "acme",
        name: "Acme Wallet",
        shortName: "Acme",
        iam: { serverUrl: "https://acme.id" },
        gateway: { rpcBaseUrl: "https://api.acme.example" },
        theme: { accent1: "#FF0000" },
      }),
    }));

    const result = await loadBrandConfig();

    // Mutated in place: the previously-held reference sees the new brand.
    expect(result).toBe(ref);
    expect(ref.id).toBe("acme");
    expect(ref.shortName).toBe("Acme");
    // Deep-merged: iam.clientId from the base brand survives a partial iam.
    expect(ref.iam.serverUrl).toBe("https://acme.id");
    expect(ref.iam.clientId).toBe("lux-wallet");
    expect(ref.gateway.rpcBaseUrl).toBe("https://api.acme.example");
    expect(ref.theme.accent1).toBe("#FF0000");
  });

  it("fails safe to the current brand when fetch rejects", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const result = await loadBrandConfig();
    expect(result.id).toBe("lux");
  });

  it("fails safe to the current brand on a non-OK response", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const result = await loadBrandConfig();
    expect(result.id).toBe("lux");
  });
});
