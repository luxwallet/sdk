import { ethers } from "ethers";
import { describe, expect, it } from "vitest";

import { addressFromPubkey } from "./account.js";
import { getBalance, signAndSendEvm } from "./evm.js";
import { fromHex, toHex } from "./hex.js";
import { SENT_HASH, fakeChains, fakeEngine } from "./testkit.js";

const PK = toHex(new Uint8Array(32).fill(7));
// The address the fake engine derives from PK — what the send self-check expects.
const baseEngine = fakeEngine();
const FROM = addressFromPubkey(baseEngine, baseEngine.secp256k1.getPublicKey(fromHex(PK), false));
const TO = ethers.getAddress("0x" + "22".repeat(20));

describe("getBalance", () => {
  it("formats wei with the chain's native decimals + symbol", async () => {
    const chains = fakeChains({ chainId: 96369, decimals: 9, symbol: "LUX", balanceHex: "0x3b9aca00" }); // 1e9
    const bal = await getBalance(chains.provider, 96369, FROM);
    expect(bal).toEqual({ wei: "1000000000", formatted: "1.0", symbol: "LUX" });
  });

  it("defaults to 18 decimals / ETH when the chain is unknown", async () => {
    const chains = fakeChains({ chainId: 1, balanceHex: "0xde0b6b3a7640000" }); // 1e18
    const bal = await getBalance(chains.provider, 1, FROM);
    expect(bal.formatted).toBe("1.0");
    expect(bal.symbol).toBe("ETH");
  });

  it("never throws — an RPC error returns wei '0' with the error attached", async () => {
    const chains = fakeChains({ chainId: 96369, symbol: "LUX", throwBalance: true });
    const bal = await getBalance(chains.provider, 96369, FROM);
    expect(bal.wei).toBe("0");
    expect(bal.formatted).toBe("0");
    expect(bal.symbol).toBe("LUX");
    expect(bal.error).toMatch(/boom/);
  });
});

describe("signAndSendEvm", () => {
  // recid at sig[64] may arrive as 27/28 (Ethereum) or 0/1 (raw) — both must
  // normalize to yParity 0/1. Drive the fake through all four.
  for (const [recid, yParity] of [
    [27, 0],
    [28, 1],
    [0, 0],
    [1, 1],
  ] as const) {
    it(`normalizes recid ${recid} to yParity ${yParity} and broadcasts`, async () => {
      const chains = fakeChains({ chainId: 96369, nonce: 3 });
      const engine = fakeEngine({ recid });
      const { hash } = await signAndSendEvm(engine, chains.provider, {
        from: FROM,
        pkHex: PK,
        chainId: 96369,
        to: TO,
        amountEther: "1.0",
      });
      expect(hash).toBe(SENT_HASH);

      const raw = chains.sentRaw()!;
      const parsed = ethers.Transaction.from(raw);
      expect(parsed.type).toBe(2); // EIP-1559
      expect(parsed.chainId).toBe(96369n);
      expect(parsed.nonce).toBe(3);
      expect(parsed.signature!.yParity).toBe(yParity);
      // EIP-1559 fee shape: maxFee = gasPrice*2 + priority(1.5 gwei).
      expect(parsed.maxPriorityFeePerGas).toBe(ethers.parseUnits("1.5", "gwei"));
      expect(parsed.maxFeePerGas).toBe(BigInt("0x3b9aca00") * 2n + ethers.parseUnits("1.5", "gwei"));
    });
  }

  it("throws (and never broadcasts) when the recovered signer mismatches", async () => {
    const chains = fakeChains({ chainId: 96369 });
    const engine = fakeEngine({ tamper: true });
    await expect(
      signAndSendEvm(engine, chains.provider, {
        from: FROM,
        pkHex: PK,
        chainId: 96369,
        to: TO,
        amountEther: "1.0",
      }),
    ).rejects.toThrow(/self-check failed/);
    expect(chains.sentRaw()).toBeUndefined();
    expect(chains.calls().some((c) => c.method === "eth_sendRawTransaction")).toBe(false);
  });
});
