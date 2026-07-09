import { beforeEach, describe, expect, it } from "vitest";

import { memoryKeychain } from "./keychain.js";
import { createLuxWallet } from "./store.js";
import { fakeChains, fakeEngine } from "./testkit.js";

/** Minimal synchronous localStorage so zustand's persist writes are observable. */
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  get length(): number {
    return this.m.size;
  }
}

// zustand's persist default is `createJSONStorage(() => window.localStorage)`,
// so the observable persistence seam is `window.localStorage`. A fresh shim per
// test (held by reference) lets us read exactly what the store wrote.
let storage: MemStorage;
beforeEach(() => {
  storage = new MemStorage();
  (globalThis as unknown as { window: { localStorage: MemStorage } }).window = { localStorage: storage };
});

function makeStore(persistName?: string) {
  const keychain = memoryKeychain();
  const chains = fakeChains({ chainId: 96369 });
  const store = createLuxWallet({
    crypto: async () => fakeEngine(),
    keychain,
    chains: chains.provider,
    persistName,
  });
  return { store, keychain, chains };
}

/** All property names anywhere in a JSON value (arrays flattened). */
function keysDeep(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(keysDeep);
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).flatMap(([k, val]) => [k, ...keysDeep(val)]);
  }
  return [];
}

describe("createLuxWallet", () => {
  it("starts idle with the provider's default chain and no accounts", () => {
    const { store } = makeStore();
    const s = store.getState();
    expect(s.selectedChainId).toBe(96369);
    expect(s.status).toBe("idle");
    expect(s.accounts).toEqual([]);
    expect(s.selectedAccountId).toBeNull();
  });

  it("createWallet inserts the account, selects it, and marks ready", async () => {
    const { store } = makeStore();
    const { account, mnemonic } = await store.getState().createWallet();
    const s = store.getState();
    expect(s.accounts).toHaveLength(1);
    expect(s.accounts[0]!.id).toBe(account.id);
    expect(s.selectedAccountId).toBe(account.id);
    expect(s.status).toBe("ready");
    expect(mnemonic.trim().split(/\s+/).length).toBeGreaterThanOrEqual(12);
  });

  it("createWallet then importMnemonic of that phrase yields the same address", async () => {
    const { store } = makeStore();
    const { account, mnemonic } = await store.getState().createWallet();
    const imported = await store.getState().importMnemonic(mnemonic);
    expect(imported.evmAddress).toBe(account.evmAddress);
  });

  it("persists ONLY accounts/selection — no secret name or value reaches storage", async () => {
    const { store, keychain } = makeStore();
    const { account, mnemonic } = await store.getState().createWallet();

    const raw = storage.getItem("lux-wallet");
    expect(raw).not.toBeNull();

    // Value-level: the real phrase and private key never appear in the blob.
    const privateKey = await keychain.getPrivateKey(account.id);
    expect(privateKey).not.toBeNull();
    expect(raw!).not.toContain(mnemonic);
    expect(raw!).not.toContain(privateKey!);
    expect(raw!).not.toContain(privateKey!.replace(/^0x/, ""));

    const persisted = JSON.parse(raw!) as { state: Record<string, unknown> };
    // Structural: exactly the partialize keys, nothing more.
    expect(Object.keys(persisted.state).sort()).toEqual([
      "accounts",
      "selectedAccountId",
      "selectedChainId",
    ]);
    // Name-level: `mnemonic`/`privateKey` fields absent; the `hasMnemonic` flag
    // is present (and is not a secret — this is why a substring scan is wrong).
    const names = keysDeep(persisted.state);
    expect(names).not.toContain("mnemonic");
    expect(names).not.toContain("privateKey");
    expect(names).toContain("hasMnemonic");
    // Sanity: the public account metadata IS persisted.
    expect(raw!).toContain(account.evmAddress);
  });

  it("honors a custom persist name", async () => {
    const { store } = makeStore("zoo-wallet");
    await store.getState().createWallet();
    expect(storage.getItem("zoo-wallet")).not.toBeNull();
    expect(storage.getItem("lux-wallet")).toBeNull();
  });

  it("removeWallet drops the account and reselects the next", async () => {
    const { store } = makeStore();
    const a = (await store.getState().createWallet()).account;
    const b = (await store.getState().createWallet()).account;
    expect(store.getState().selectedAccountId).toBe(b.id); // last created is selected

    await store.getState().removeWallet(b.id);
    const s = store.getState();
    expect(s.accounts.map((x) => x.id)).toEqual([a.id]);
    expect(s.selectedAccountId).toBe(a.id); // reselected the remaining account

    await store.getState().removeWallet(a.id);
    expect(store.getState().selectedAccountId).toBeNull();
  });

  it("revealMnemonic returns the sealed phrase; a dropped wallet reveals null", async () => {
    const { store } = makeStore();
    const { account, mnemonic } = await store.getState().createWallet();
    expect(await store.getState().revealMnemonic(account.id)).toBe(mnemonic);
    await store.getState().removeWallet(account.id);
    expect(await store.getState().revealMnemonic(account.id)).toBeNull();
  });

  it("importPrivateKey adds a key-only account with no mnemonic to reveal", async () => {
    const { store } = makeStore();
    const acct = await store.getState().importPrivateKey("0x" + "07".repeat(32));
    expect(acct.hasMnemonic).toBe(false);
    expect(store.getState().selectedAccountId).toBe(acct.id);
    expect(await store.getState().revealMnemonic(acct.id)).toBeNull();
  });

  it("importPrivateKey stays 'local-hd-pq' even if an untyped caller smuggles a type", async () => {
    const { store } = makeStore();
    // Public signature is { label? } only; simulate an untyped JS caller that
    // passes { type: 'mpc' } at runtime. The key-only type must not budge.
    const importPk = store.getState().importPrivateKey as unknown as (
      pk: string,
      opts?: { label?: string; type?: string },
    ) => Promise<{ type: string }>;
    const acct = await importPk("0x" + "07".repeat(32), { type: "mpc" });
    expect(acct.type).toBe("local-hd-pq");
  });
});
