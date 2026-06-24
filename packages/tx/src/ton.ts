/**
 * TON native-transfer builder — REAL (the transfer message), offline.
 *
 * Lib: @ton/core (MIT). Builds the relaxed internal transfer message
 * (recipient, value in nanotons, optional text comment), serializes it to
 * a Cell, and emits the Cell's BOC bytes plus the Cell hash.
 *
 * Scope note: on TON the bytes actually SIGNED are the wallet contract's
 * transfer cell (`seqno || valid_until || send_mode || ref(message)`),
 * which is wallet-version-specific (v3R2/v4R2/v5). That outer wrapping +
 * the ed25519 signature belong to @luxwallet/keyring (it knows the wallet
 * version). This builder produces the canonical inner transfer message
 * (the `body`/message the keyring references) and carries `seqno` +
 * `sendMode` in the summary so the signer can assemble the outer cell.
 * `serialized` = the message BOC; `digest` = the message Cell hash.
 */
import { beginCell, internal, storeMessageRelaxed, Address, SendMode } from "@ton/core";
import type { TonTxIntent, UnsignedTx } from "./types.js";

function bufToHex(buf: Uint8Array): `0x${string}` {
  let s = "";
  for (const b of buf) s += b.toString(16).padStart(2, "0");
  return `0x${s}`;
}

/** Build the unsigned TON internal transfer message (BOC + cell hash). */
export function buildTonUnsignedTx(intent: TonTxIntent): UnsignedTx {
  const value = BigInt(intent.amountNano);
  if (value <= 0n) throw new Error("@luxwallet/tx: ton amountNano must be > 0");

  // Validate/normalise the destination (throws on a malformed address).
  const to = Address.parse(intent.to);

  const message = internal({
    to,
    value,
    bounce: intent.bounce ?? true,
    body: intent.comment, // string => stored as a text comment cell
  });

  const cell = beginCell()
    .storeWritable(storeMessageRelaxed(message))
    .endCell();

  return {
    family: "ton",
    serialized: bufToHex(cell.toBoc()),
    digest: bufToHex(cell.hash()),
    summary: {
      chain: "TON",
      to: to.toString(),
      amountNano: value.toString(),
      ton: (Number(value) / 1e9).toString(),
      seqno: String(intent.seqno),
      sendMode: String(intent.sendMode ?? SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS),
      ...(intent.comment ? { comment: intent.comment } : {}),
    },
  };
}
