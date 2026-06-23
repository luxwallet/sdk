import { describe, expect, it, beforeEach } from "vitest";
import {
  Scheme,
  Sizes,
  crypto,
  isCryptoAvailable,
  mldsa65,
  setBackend,
  type CryptoBackend,
} from "./index.js";

describe("@luxwallet/crypto facade (unbound)", () => {
  it("exposes FIPS-204 ML-DSA-65 sizes matching luxfi (pk 1952, sig 3309)", () => {
    expect(Sizes.mldsa65).toEqual({ pk: 1952, sig: 3309 });
    expect(Sizes.mldsa44).toEqual({ pk: 1312, sig: 2420 });
    expect(Sizes.mldsa87).toEqual({ pk: 2592, sig: 4627 });
  });

  it("pins the ML-DSA-65 scheme byte to 0x42 (luxfi SigSchemeID)", () => {
    expect(Scheme.MLDSA65).toBe(0x42);
    expect(Scheme.SLHDSA192s).toBe(0x62);
  });

  it("reports not available before a backend is bound", () => {
    expect(isCryptoAvailable()).toBe(false);
  });

  it("throws 'not yet bound' for every primitive until setBackend is called", async () => {
    await expect(mldsa65.sign(new Uint8Array(), new Uint8Array())).rejects.toThrow(/not yet bound/);
    await expect(crypto().mldsa65.keypair()).rejects.toThrow(/not yet bound/);
    await expect(crypto().mlkem768.keypair()).rejects.toThrow(/not yet bound/);
    await expect(crypto().shake256(new Uint8Array(), 48)).rejects.toThrow(/not yet bound/);
  });
});

describe("@luxwallet/crypto facade (backend injection)", () => {
  beforeEach(() => {
    // Reset to a fresh fake each test; index module holds module-level state.
    const fake: CryptoBackend = {
      ready: async () => {},
      available: true,
      mldsa65: {
        keypair: async () => ({ publicKey: new Uint8Array([1]), secretKey: new Uint8Array([2]) }),
        fromSeed: async () => ({ publicKey: new Uint8Array([1]), secretKey: new Uint8Array([2]) }),
        sign: async () => new Uint8Array([0xaa]),
        verify: async () => true,
      },
    } as unknown as CryptoBackend;
    setBackend(fake);
  });

  it("routes facade calls through the injected backend", async () => {
    expect(isCryptoAvailable()).toBe(true);
    const sig = await mldsa65.sign(new Uint8Array([1]), new Uint8Array([2]));
    expect(sig).toEqual(new Uint8Array([0xaa]));
    expect(await mldsa65.verify(new Uint8Array(), new Uint8Array(), sig)).toBe(true);
  });
});
