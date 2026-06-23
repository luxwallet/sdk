import { describe, expect, it } from "vitest";
import { Keyring, Scheme, derivationPathFor, type Account } from "./index.js";
import { accountIdMessage } from "./account-id.js";

function fakeAccount(id: string): Account {
  return {
    accountId: id,
    scheme: Scheme.MLDSA65,
    role: "tx",
    networkId: 96369,
    publicKey: new Uint8Array([1, 2, 3]),
    derivationPath: "m/44'/9000'/96369'/0'/1'/0'",
  };
}

describe("@luxwallet/keyring Keyring store", () => {
  it("adds and gets accounts by AccountID", () => {
    const kr = new Keyring();
    kr.add(fakeAccount("aa"));
    expect(kr.get("aa")?.accountId).toBe("aa");
    expect(kr.size).toBe(1);
  });

  it("refuses duplicate AccountIDs", () => {
    const kr = new Keyring();
    kr.add(fakeAccount("aa"));
    expect(() => kr.add(fakeAccount("aa"))).toThrow(/already exists/);
  });

  it("removes accounts and reports presence", () => {
    const kr = new Keyring();
    kr.add(fakeAccount("aa"));
    expect(kr.remove("aa")).toBe(true);
    expect(kr.remove("aa")).toBe(false);
    expect(kr.get("aa")).toBeUndefined();
  });

  it("lists account ids", () => {
    const kr = new Keyring();
    kr.add(fakeAccount("aa"));
    kr.add(fakeAccount("bb"));
    expect(new Set(kr.accountIds())).toEqual(new Set(["aa", "bb"]));
  });
});

describe("@luxwallet/keyring derivation paths", () => {
  it("uses EVM coinType 60 for secp256k1", () => {
    expect(derivationPathFor({ masterSeed: new Uint8Array(), scheme: Scheme.Secp256k1, role: "tx", networkId: 96369 })).toBe(
      "m/44'/60'/0'/0/0",
    );
  });

  it("uses the ML-DSA branch (coinType 9000, role index) for ML-DSA-65 tx", () => {
    expect(derivationPathFor({ masterSeed: new Uint8Array(), scheme: Scheme.MLDSA65, role: "tx", networkId: 96369 })).toBe(
      "m/44'/9000'/96369'/0'/1'/0'",
    );
  });

  it("uses the SLH-DSA recovery branch (2') for recovery role", () => {
    expect(derivationPathFor({ masterSeed: new Uint8Array(), scheme: Scheme.SLHDSA192s, role: "recovery", networkId: 96369 })).toBe(
      "m/44'/9000'/96369'/2'/0'/0'",
    );
  });
});

describe("@luxwallet/keyring AccountID message framing", () => {
  it("frames u32be(networkId) ‖ u8(scheme) ‖ pubkey", () => {
    const msg = accountIdMessage(96369, Scheme.MLDSA65, new Uint8Array([0xde, 0xad]));
    // 96369 = 0x00017871 big-endian, scheme 0x42, then pubkey.
    expect([...msg]).toEqual([0x00, 0x01, 0x78, 0x71, 0x42, 0xde, 0xad]);
  });

  it("rejects a networkId out of u32 range", () => {
    expect(() => accountIdMessage(2 ** 33, Scheme.MLDSA65, new Uint8Array())).toThrow(/u32 range/);
  });
});
