/**
 * Solana (SVM) native-transfer builder — REAL, fully offline.
 *
 * Lib: @solana/web3.js (MIT). Builds a legacy `Transaction` with a single
 * `SystemProgram.transfer` instruction, pins the fee-payer and a
 * caller-supplied `recentBlockhash`, then compiles to the wire `Message`.
 * The serialized message bytes ARE the bytes the signer signs (ed25519
 * over the compiled message); the signed tx is `[signature || message]`,
 * assembled by @luxwallet/keyring. This package never signs.
 */
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { SolanaTxIntent, UnsignedTx } from "./types.js";

function toHex(bytes: Uint8Array): `0x${string}` {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return `0x${s}`;
}

/** Build an unsigned Solana SOL transfer. `digest` = serialized = the message to sign. */
export function buildSolanaUnsignedTx(intent: SolanaTxIntent): UnsignedTx {
  const from = new PublicKey(intent.from);
  const to = new PublicKey(intent.to);
  const lamports = BigInt(intent.lamports);
  if (lamports <= 0n) throw new Error("@luxwallet/tx: solana lamports must be > 0");

  const tx = new Transaction();
  tx.feePayer = from;
  tx.recentBlockhash = intent.recentBlockhash;
  tx.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      // web3.js accepts number | bigint; bigint avoids 2^53 truncation.
      lamports,
    }),
  );

  // The compiled message is exactly what an ed25519 signer signs. Throws
  // if required fields (feePayer/blockhash) are missing — fail loudly.
  const message = tx.compileMessage();
  const serialized = toHex(message.serialize());

  return {
    family: "solana",
    serialized,
    // Solana signs the raw message bytes; serialized === digest here.
    digest: serialized,
    summary: {
      chain: "Solana",
      from: intent.from,
      to: intent.to,
      lamports: lamports.toString(),
      sol: (Number(lamports) / LAMPORTS_PER_SOL).toString(),
      recentBlockhash: intent.recentBlockhash,
    },
  };
}
