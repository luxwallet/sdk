/**
 * XRP Ledger native-transfer builder — REAL, fully offline.
 *
 * Lib: xrpl (ISC) — uses its `Payment` transaction model and
 * `encodeForSigning`, which serializes the tx with the single-sign prefix
 * (`STX\0`). The hex it returns IS the blob the signer signs (the signer
 * hashes it with SHA-512Half per the scheme). The account's public key
 * must be embedded as `SigningPubKey` because it is part of the signed
 * serialization — the caller supplies it (`signingPubKey`); the keyring
 * then signs `encodeForSigning(...)` and assembles `TxnSignature`.
 *
 * This package never signs.
 */
import { encodeForSigning, type Payment } from "xrpl";
import type { UnsignedTx, XrpTxIntent } from "./types.js";

function hexToBytesHex(hex: string): `0x${string}` {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return `0x${clean.toLowerCase()}`;
}

/**
 * Build an unsigned XRP Payment. Returns the `encodeForSigning` blob as
 * both `serialized` and `digest` (XRP signs that exact blob).
 */
export function buildXrpUnsignedTx(intent: XrpTxIntent): UnsignedTx {
  if (!intent.signingPubKey) {
    // SigningPubKey is part of the signed serialization; without it the
    // produced bytes would not match the broadcastable tx. The account's
    // public key is known at build time — require it. (Don't silently
    // emit bytes the signer can't actually use.)
    throw new Error("@luxwallet/tx: xrp requires intent.signingPubKey (hex of the account public key)");
  }
  if (BigInt(intent.amountDrops) <= 0n) {
    throw new Error("@luxwallet/tx: xrp amountDrops must be > 0");
  }

  const tx: Payment = {
    TransactionType: "Payment",
    Account: intent.account,
    Destination: intent.destination,
    Amount: intent.amountDrops, // drops, as a string
    Sequence: intent.sequence,
    Fee: intent.fee ?? "10",
    SigningPubKey: intent.signingPubKey.toUpperCase(),
    ...(intent.lastLedgerSequence !== undefined
      ? { LastLedgerSequence: intent.lastLedgerSequence }
      : {}),
    ...(intent.destinationTag !== undefined ? { DestinationTag: intent.destinationTag } : {}),
  };

  // Hex of the bytes to sign (single-signing prefix + serialized tx).
  const signingHex = encodeForSigning(tx);
  const serialized = hexToBytesHex(signingHex);

  return {
    family: "xrp",
    serialized,
    digest: serialized,
    summary: {
      chain: "XRP Ledger",
      account: intent.account,
      destination: intent.destination,
      amountDrops: intent.amountDrops,
      fee: tx.Fee as string,
      sequence: String(intent.sequence),
      ...(intent.lastLedgerSequence !== undefined
        ? { lastLedgerSequence: String(intent.lastLedgerSequence) }
        : {}),
    },
  };
}
