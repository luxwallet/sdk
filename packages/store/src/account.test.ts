import { ethers } from "ethers";
import { describe, expect, it } from "vitest";

import { accountFromMnemonic, accountFromPrivateKey, addressFromPubkey } from "./account.js";
import { fromHex, toHex } from "./hex.js";
import { fakeEngine } from "./testkit.js";
import type { AccountMeta } from "./account.js";

const engine = fakeEngine();
const meta = (id: string): AccountMeta => ({
  id,
  label: "Wallet 1",
  type: "local-hd-pq",
  createdAt: 0,
});

describe("accountFromMnemonic", () => {
  it("is deterministic — the same phrase yields the same address (create ≡ import)", () => {
    const phrase = ethers.Wallet.createRandom().mnemonic!.phrase;
    const a = accountFromMnemonic(engine, phrase, meta("a"));
    const b = accountFromMnemonic(engine, phrase, meta("b"));
    expect(a.account.evmAddress).toBe(b.account.evmAddress);
    expect(a.account.evmAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("normalizes whitespace before deriving (extra spaces do not change the key)", () => {
    const phrase = ethers.Wallet.createRandom().mnemonic!.phrase;
    const tidy = accountFromMnemonic(engine, phrase, meta("a"));
    const messy = accountFromMnemonic(engine, `  ${phrase.replace(/ /g, "   ")}  `, meta("b"));
    expect(messy.account.evmAddress).toBe(tidy.account.evmAddress);
    expect(messy.secrets.mnemonic).toBe(phrase);
  });

  it("marks the account HD-backed and seals mnemonic + private key", () => {
    const phrase = ethers.Wallet.createRandom().mnemonic!.phrase;
    const { account, secrets } = accountFromMnemonic(engine, phrase, meta("a"));
    expect(account.hasMnemonic).toBe(true);
    expect(account.pqPublicKey).not.toBe("");
    expect(account.pqNodeId).not.toBe("");
    expect(secrets.mnemonic).toBe(phrase);
    expect(secrets.privateKey).toMatch(/^0x[0-9a-f]+$/);
  });

  it("rejects an invalid BIP-39 mnemonic (ethers.Mnemonic validation)", () => {
    expect(() => accountFromMnemonic(engine, "not a valid recovery phrase at all", meta("a"))).toThrow();
  });
});

describe("accountFromPrivateKey", () => {
  it("derives the address as keccak(pub[1:])[-20:] over the uncompressed pubkey", () => {
    const sk = fakeHashSk();
    const pkHex = toHex(sk);
    const { account, secrets } = accountFromPrivateKey(engine, pkHex, meta("a"));

    const pub = engine.secp256k1.getPublicKey(sk, false);
    const expected = ethers.getAddress(toHex(engine.keccak256(pub.slice(1)).slice(-20)));
    expect(account.evmAddress).toBe(expected);
    expect(account.evmAddress).toBe(addressFromPubkey(engine, pub));

    expect(account.hasMnemonic).toBe(false);
    expect(account.pqPublicKey).toBe("");
    expect(account.pqNodeId).toBe("");
    expect(secrets.mnemonic).toBeUndefined();
    expect(secrets.privateKey).toBe(pkHex);
  });

  it("accepts a bare (no-0x) private key and rejects a wrong-length key", () => {
    const sk = fakeHashSk();
    const bare = toHex(sk).slice(2);
    const withPrefix = accountFromPrivateKey(engine, toHex(sk), meta("a"));
    const without = accountFromPrivateKey(engine, bare, meta("b"));
    expect(without.account.evmAddress).toBe(withPrefix.account.evmAddress);

    expect(() => accountFromPrivateKey(engine, "0x1234", meta("c"))).toThrow(/32 bytes/);
  });
});

/** A concrete 32-byte secret key for the private-key tests. */
function fakeHashSk(): Uint8Array {
  return fromHex("0x" + "11".repeat(31) + "22");
}
