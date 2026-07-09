import { describe, expect, it, vi } from "vitest";

import { memoryKeychain, tauriKeychain } from "./keychain.js";
import type { TauriKeychainBridge } from "./keychain.js";

const ID = "acct-1";
const MNEMONIC_KEY = `luxwallet:${ID}:mnemonic`;
const PRIVATE_KEY_KEY = `luxwallet:${ID}:privateKey`;

describe("memoryKeychain", () => {
  it("seals and returns mnemonic + private key, then drops both", async () => {
    const kc = memoryKeychain();
    await kc.seal(ID, { mnemonic: "phrase words", privateKey: "0xdeadbeef" });
    expect(await kc.getMnemonic(ID)).toBe("phrase words");
    expect(await kc.getPrivateKey(ID)).toBe("0xdeadbeef");
    await kc.drop(ID);
    expect(await kc.getMnemonic(ID)).toBeNull();
    expect(await kc.getPrivateKey(ID)).toBeNull();
  });

  it("a private-key-only seal has no mnemonic", async () => {
    const kc = memoryKeychain();
    await kc.seal(ID, { privateKey: "0xabc123" });
    expect(await kc.getMnemonic(ID)).toBeNull();
    expect(await kc.getPrivateKey(ID)).toBe("0xabc123");
  });
});

describe("tauriKeychain (bridge available)", () => {
  function liveBridge() {
    const store = new Map<string, string>();
    const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      const key = args?.key as string;
      if (cmd === "secure_storage_set") store.set(key, args?.value as string);
      else if (cmd === "secure_storage_get") return store.get(key) ?? null;
      else if (cmd === "secure_storage_delete") store.delete(key);
      return undefined;
    });
    const bridge: TauriKeychainBridge = { invoke: invoke as TauriKeychainBridge["invoke"], isAvailable: () => true };
    return { bridge, invoke };
  }

  it("routes through bridge.invoke using the exact luxwallet: key format", async () => {
    const { bridge, invoke } = liveBridge();
    const kc = tauriKeychain(bridge);

    await kc.seal(ID, { mnemonic: "m", privateKey: "0x01" });
    expect(invoke).toHaveBeenCalledWith("secure_storage_set", { key: MNEMONIC_KEY, value: "m" });
    expect(invoke).toHaveBeenCalledWith("secure_storage_set", { key: PRIVATE_KEY_KEY, value: "0x01" });

    expect(await kc.getMnemonic(ID)).toBe("m");
    expect(invoke).toHaveBeenCalledWith("secure_storage_get", { key: MNEMONIC_KEY });
    expect(await kc.getPrivateKey(ID)).toBe("0x01");
    expect(invoke).toHaveBeenCalledWith("secure_storage_get", { key: PRIVATE_KEY_KEY });

    await kc.drop(ID);
    expect(invoke).toHaveBeenCalledWith("secure_storage_delete", { key: MNEMONIC_KEY });
    expect(invoke).toHaveBeenCalledWith("secure_storage_delete", { key: PRIVATE_KEY_KEY });
  });

  it("omits the mnemonic set when sealing a private-key-only secret", async () => {
    const { bridge, invoke } = liveBridge();
    const kc = tauriKeychain(bridge);
    await kc.seal(ID, { privateKey: "0x01" });
    expect(invoke).not.toHaveBeenCalledWith("secure_storage_set", { key: MNEMONIC_KEY, value: expect.anything() });
    expect(invoke).toHaveBeenCalledWith("secure_storage_set", { key: PRIVATE_KEY_KEY, value: "0x01" });
  });
});

describe("tauriKeychain (bridge unavailable)", () => {
  it("falls back to in-process memory and never calls invoke", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("invoke must not be called when unavailable");
    });
    const bridge: TauriKeychainBridge = { invoke: invoke as TauriKeychainBridge["invoke"], isAvailable: () => false };
    const kc = tauriKeychain(bridge);

    await kc.seal(ID, { mnemonic: "m", privateKey: "0x01" });
    expect(await kc.getMnemonic(ID)).toBe("m");
    expect(await kc.getPrivateKey(ID)).toBe("0x01");
    await kc.drop(ID);
    expect(await kc.getMnemonic(ID)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
