import { describe, expect, it } from "vitest";
import { decode } from "xrpl";
import { buildXrpUnsignedTx } from "./xrp.js";

// A valid secp256k1 public key (33-byte compressed, 66 hex chars) — used
// only as the SigningPubKey for shape/round-trip assertions.
const PUBKEY = "03AB40A0490F9B7ED8DF29D246BF2D6269820A0EE7742ACDD457BEA7C7D0931EDB";
const ACCOUNT = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const DEST = "rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW";

// XRP single-signing prefix: "STX\0" = 0x53545800.
const SIGNING_PREFIX = "53545800";

describe("@luxwallet/tx XRP builder (real)", () => {
  const intent = {
    account: ACCOUNT,
    destination: DEST,
    amountDrops: "22000000", // 22 XRP
    sequence: 1,
    fee: "12",
    lastLedgerSequence: 100,
    signingPubKey: PUBKEY,
  };

  it("produces the single-signing blob; serialized === digest with STX prefix", () => {
    const tx = buildXrpUnsignedTx(intent);
    expect(tx.family).toBe("xrp");
    expect(tx.serialized).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.digest).toBe(tx.serialized);
    expect(tx.serialized.slice(2).startsWith(SIGNING_PREFIX)).toBe(true);
  });

  it("round-trips: the encoded body decodes to the Payment fields", () => {
    const tx = buildXrpUnsignedTx(intent);
    // Strip the 4-byte signing prefix to recover the canonical tx body.
    const bodyHex = tx.serialized.slice(2 + SIGNING_PREFIX.length).toUpperCase();
    const decoded = decode(bodyHex) as Record<string, unknown>;
    expect(decoded.TransactionType).toBe("Payment");
    expect(decoded.Account).toBe(ACCOUNT);
    expect(decoded.Destination).toBe(DEST);
    expect(decoded.Amount).toBe("22000000");
    expect(decoded.Sequence).toBe(1);
    expect(decoded.Fee).toBe("12");
    expect(decoded.LastLedgerSequence).toBe(100);
    // SigningPubKey is part of the signed serialization.
    expect(decoded.SigningPubKey).toBe(PUBKEY);
    // Unsigned: no TxnSignature present.
    expect(decoded.TxnSignature).toBeUndefined();
  });

  it("requires a signing public key", () => {
    const { signingPubKey: _omit, ...noKey } = intent;
    expect(() => buildXrpUnsignedTx(noKey)).toThrow(/signingPubKey/);
  });

  it("rejects non-positive amounts", () => {
    expect(() => buildXrpUnsignedTx({ ...intent, amountDrops: "0" })).toThrow(/> 0/);
  });
});
