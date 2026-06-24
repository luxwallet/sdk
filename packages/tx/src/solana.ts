/**
 * Solana (SVM) native-transfer builder — REAL, fully offline, ZERO copyleft.
 *
 * Serialises a legacy Solana message with a single System Program transfer by
 * hand (the wire format is deterministic + documented), using only @scure/base
 * (MIT) for base58. This deliberately AVOIDS @solana/web3.js v1 in the shipped
 * package — it pulls `rpc-websockets` (LGPL-3.0) transitively for its RPC
 * `Connection` (which we never use). web3.js stays a DEV dependency: the test
 * asserts this builder's bytes EQUAL web3.js's `compileMessage().serialize()`,
 * so we keep that library as a byte-for-byte reference without shipping its
 * copyleft transitive.
 *
 * The serialized message bytes ARE what an ed25519 signer signs; the signed tx
 * is `[signatures || message]`, assembled by @luxwallet/keyring. Never signs.
 *
 * Legacy message layout:
 *   header(3) ‖ accountKeys(compact-array of 32B) ‖ recentBlockhash(32)
 *            ‖ instructions(compact-array)
 *   header = [numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned]
 *   account order = signer-writable, signer-readonly, nonsigner-writable,
 *                   nonsigner-readonly  → here: from(0), to(1), systemProgram(2)
 *   instruction = programIdIndex(1) ‖ accountIdxs(compact) ‖ data(compact)
 *   transfer data = u32LE(2) ‖ u64LE(lamports)
 */
import { base58 } from "@scure/base";
import type { SolanaTxIntent, UnsignedTx } from "./types.js";

/** System Program id "111…1" decodes to 32 zero bytes. */
const SYSTEM_PROGRAM_ID = new Uint8Array(32);
const LAMPORTS_PER_SOL = 1_000_000_000;

function toHex(bytes: Uint8Array): `0x${string}` {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return `0x${s}`;
}

/** Solana shortvec (compact-u16) length prefix. */
function shortVec(n: number): Uint8Array {
  const out: number[] = [];
  let v = n;
  for (;;) {
    const b = v & 0x7f;
    v >>>= 7;
    if (v === 0) {
      out.push(b);
      break;
    }
    out.push(b | 0x80);
  }
  return Uint8Array.from(out);
}

function pubkey32(b58: string, label: string): Uint8Array {
  const k = base58.decode(b58.trim());
  if (k.length !== 32) {
    throw new Error(`@luxwallet/tx: solana ${label} must be a 32-byte base58 key`);
  }
  return k;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

/** Build an unsigned Solana SOL transfer. `digest` = serialized = message to sign. */
export function buildSolanaUnsignedTx(intent: SolanaTxIntent): UnsignedTx {
  const from = pubkey32(intent.from, "from");
  const to = pubkey32(intent.to, "to");
  const lamports = BigInt(intent.lamports);
  if (lamports <= 0n) throw new Error("@luxwallet/tx: solana lamports must be > 0");
  const blockhash = pubkey32(intent.recentBlockhash, "recentBlockhash");

  // from = signer+writable (idx 0), to = nonsigner+writable (idx 1),
  // systemProgram = nonsigner+readonly (idx 2).
  const header = Uint8Array.from([1, 0, 1]);
  const accountKeys = concat(shortVec(3), from, to, SYSTEM_PROGRAM_ID);

  const data = concat(u32le(2), u64le(lamports)); // SystemInstruction::Transfer
  const instruction = concat(
    Uint8Array.from([2]), // programIdIndex → systemProgram
    shortVec(2),
    Uint8Array.from([0, 1]), // account indices: from, to
    shortVec(data.length),
    data,
  );
  const instructions = concat(shortVec(1), instruction);

  const message = concat(header, accountKeys, blockhash, instructions);
  const serialized = toHex(message);

  return {
    family: "solana",
    serialized,
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
