import { describe, expect, it } from "vitest";
import { DEFAULT_GATEWAY, RpcClient, getRpcUrl } from "./index.js";

describe("@luxwallet/rpc getRpcUrl", () => {
  it("builds https://<default gateway>/v1/rpc/<chainId> by EIP-155 id", () => {
    expect(getRpcUrl(96369)).toBe(`https://${DEFAULT_GATEWAY}/v1/rpc/96369`);
  });

  it("builds the same URL by registry id", () => {
    expect(getRpcUrl("lux-c-mainnet")).toBe(getRpcUrl(96369));
  });

  it("honors a brand gateway override and strips scheme + trailing slash", () => {
    expect(getRpcUrl(96369, { gateway: "https://api.lux.network/" })).toBe(
      "https://api.lux.network/v1/rpc/96369",
    );
  });

  it("per-chain override (by chain id) wins over the gateway URL", () => {
    expect(getRpcUrl(96369, { overrides: { 96369: "https://private.example/rpc" } })).toBe(
      "https://private.example/rpc",
    );
  });

  it("per-chain override (by registry id) wins too", () => {
    expect(getRpcUrl("lux-c-mainnet", { overrides: { "lux-c-mainnet": "https://x/rpc" } })).toBe(
      "https://x/rpc",
    );
  });

  it("ignores an empty-string override (never returns empty)", () => {
    const url = getRpcUrl(96369, { overrides: { 96369: "" } });
    expect(url).toBe(`https://${DEFAULT_GATEWAY}/v1/rpc/96369`);
    expect(url.length).toBeGreaterThan(0);
  });

  it("routes a non-EVM family by its gateway alias", () => {
    expect(getRpcUrl("lux-x-mainnet")).toBe(`https://${DEFAULT_GATEWAY}/v1/rpc/X`);
    expect(getRpcUrl("lux-p-mainnet")).toBe(`https://${DEFAULT_GATEWAY}/v1/rpc/P`);
  });

  it("throws on an unknown chain", () => {
    expect(() => getRpcUrl(424242)).toThrow(/unknown chain/);
  });
});

describe("@luxwallet/rpc RpcClient", () => {
  it("binds to the resolved gateway URL", () => {
    const c = new RpcClient(96369);
    expect(c.url).toBe(`https://${DEFAULT_GATEWAY}/v1/rpc/96369`);
  });
});
