import { describe, expect, it } from "vitest";
import { Cell, loadMessageRelaxed, Address } from "@ton/core";
import { buildTonUnsignedTx } from "./ton.js";

const DEST = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t";

describe("@luxwallet/tx TON builder (real transfer message)", () => {
  const intent = { to: DEST, amountNano: "1500000000", seqno: 5, comment: "gm" };

  it("produces a message BOC + cell-hash digest (0x hex)", () => {
    const tx = buildTonUnsignedTx(intent);
    expect(tx.family).toBe("ton");
    expect(tx.serialized).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.digest).toMatch(/^0x[0-9a-f]{64}$/); // 32-byte cell hash
  });

  it("round-trips: the BOC parses to the internal transfer message", () => {
    const tx = buildTonUnsignedTx(intent);
    const cell = Cell.fromBoc(Buffer.from(tx.serialized.slice(2), "hex"))[0]!;
    const msg = loadMessageRelaxed(cell.beginParse());

    expect(msg.info.type).toBe("internal");
    if (msg.info.type !== "internal") throw new Error("expected internal message");
    expect(msg.info.dest.toString()).toBe(Address.parse(DEST).toString());
    expect(msg.info.value.coins).toBe(1500000000n);
    expect(msg.info.bounce).toBe(true);
  });

  it("the digest equals the message cell hash", () => {
    const tx = buildTonUnsignedTx(intent);
    const cell = Cell.fromBoc(Buffer.from(tx.serialized.slice(2), "hex"))[0]!;
    expect(`0x${Buffer.from(cell.hash()).toString("hex")}`).toBe(tx.digest);
  });

  it("rejects non-positive amounts", () => {
    expect(() => buildTonUnsignedTx({ ...intent, amountNano: "0" })).toThrow(/> 0/);
  });
});
