import { describe, expect, it } from "vitest";
import {
  Message,
  PublicKey,
  SystemProgram,
  SystemInstruction,
  Transaction,
} from "@solana/web3.js";
import { buildSolanaUnsignedTx } from "./solana.js";

// Two well-known on-curve accounts (System program + a vote account) used
// only as valid base58 pubkeys for shape assertions.
const FROM = "11111111111111111111111111111112";
const TO = "So11111111111111111111111111111111111111112";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";

describe("@luxwallet/tx Solana builder (real)", () => {
  const intent = { from: FROM, to: TO, lamports: "1000000000", recentBlockhash: BLOCKHASH };

  it("produces an unsigned message; serialized === digest (0x hex)", () => {
    const tx = buildSolanaUnsignedTx(intent);
    expect(tx.family).toBe("solana");
    expect(tx.serialized).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.digest).toBe(tx.serialized);
  });

  it("round-trips: the compiled message decodes to a SystemProgram transfer", () => {
    const tx = buildSolanaUnsignedTx(intent);
    const bytes = Buffer.from(tx.serialized.slice(2), "hex");
    const msg = Message.from(bytes);

    // Fee payer is account index 0 and equals `from`.
    expect(msg.accountKeys[0]?.toBase58()).toBe(new PublicKey(FROM).toBase58());
    expect(msg.recentBlockhash).toBe(BLOCKHASH);

    // Exactly one instruction, owned by the System program.
    expect(msg.instructions).toHaveLength(1);
    const ix = msg.instructions[0]!;
    expect(msg.accountKeys[ix.programIdIndex]?.toBase58()).toBe(
      SystemProgram.programId.toBase58(),
    );

    // Recover the decompiled instruction (web3.js handles the base58 data
    // decode) and assert it is a SystemProgram transfer with our amount.
    const tx2 = Transaction.populate(msg);
    const decoded = SystemInstruction.decodeTransfer(tx2.instructions[0]!);
    expect(SystemInstruction.decodeInstructionType(tx2.instructions[0]!)).toBe("Transfer");
    expect(decoded.lamports).toBe(1000000000n);
    expect(decoded.fromPubkey.toBase58()).toBe(new PublicKey(FROM).toBase58());
    expect(decoded.toPubkey.toBase58()).toBe(new PublicKey(TO).toBase58());
  });

  it("round-trips byte-for-byte against an identically built message", () => {
    const tx = buildSolanaUnsignedTx(intent);
    const ref = new Transaction();
    ref.feePayer = new PublicKey(FROM);
    ref.recentBlockhash = BLOCKHASH;
    ref.add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(FROM),
        toPubkey: new PublicKey(TO),
        lamports: 1000000000n,
      }),
    );
    const refHex = `0x${Buffer.from(ref.compileMessage().serialize()).toString("hex")}`;
    expect(tx.serialized).toBe(refHex);
  });

  it("is unsigned (header requires 1 signature, none attached in the message)", () => {
    const tx = buildSolanaUnsignedTx(intent);
    const msg = Message.from(Buffer.from(tx.serialized.slice(2), "hex"));
    // The message itself carries no signatures (that's the Transaction wrapper).
    expect(msg.header.numRequiredSignatures).toBe(1);
  });

  it("rejects non-positive amounts", () => {
    expect(() => buildSolanaUnsignedTx({ ...intent, lamports: "0" })).toThrow(/> 0/);
  });
});
