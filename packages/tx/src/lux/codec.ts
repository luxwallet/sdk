/**
 * Lux ZAP-native wire codec primitives — REAL, fully offline, ZERO deps
 * (hand-rolled like the Solana builder). This is the canonical
 * serialization the Lux SDK signs over: `luxfi/codec` zapcodec, routed
 * through `proto/zap_codec`, as used by `sdk/wallet/chain/{x,p}`.
 *
 * Wire format (verified byte-for-byte against the pinned Go modules
 * `luxfi/proto@v1.3.5` + `luxfi/utxo@v0.3.7`; see lux/*.test.ts KATs):
 *
 *   - codec version prefix: 2 bytes, little-endian uint16 (= 0x0000 for
 *     CodecVersion 0). (`proto/zap_codec.writeVersionLE`.)
 *   - everything after byte 2 is LITTLE-ENDIAN: uint16/uint32/uint64,
 *     slice-length prefixes (uint32 LE), interface type-ids (uint32 LE).
 *     (`luxfi/codec/zapcodec` packer — TestWireIsLittleEndian.)
 *   - ids.ID = 32 raw bytes; ids.ShortID (address) = 20 raw bytes; no
 *     length prefix on fixed arrays.
 *   - []byte = uint32 LE length, then the raw bytes.
 *   - a polymorphic interface field (the unsigned tx, a TransferableOut's
 *     inner Out, a TransferableIn's inner In) is prefixed by its uint32
 *     LE type-id from the codec's sequential registration order.
 *
 * Type-ids (shared cross-chain so atomic UTXOs keep identical ids):
 *   secp256k1fx.TransferInput = 5, MintOutput = 6, TransferOutput = 7.
 *   (Registration order in proto/x/txs + proto/p/txs codec.go.)
 *
 * This module NEVER signs. It produces the canonical unsigned bytes
 * (`Codec.Marshal(0, &tx.Unsigned)`), which ARE the bytes the keyring
 * hashes + signs.
 */

const CODEC_VERSION = 0;

/** Growable little-endian byte writer. */
export class Writer {
  private buf: number[] = [];

  u8(v: number): this {
    this.buf.push(v & 0xff);
    return this;
  }

  /** uint16, little-endian. */
  u16(v: number): this {
    this.buf.push(v & 0xff, (v >>> 8) & 0xff);
    return this;
  }

  /** uint32, little-endian. */
  u32(v: number): this {
    this.buf.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    return this;
  }

  /** uint64, little-endian (bigint). */
  u64(v: bigint): this {
    let x = BigInt.asUintN(64, v);
    for (let i = 0; i < 8; i++) {
      this.buf.push(Number(x & 0xffn));
      x >>= 8n;
    }
    return this;
  }

  /** Raw bytes, no length prefix (fixed arrays: ids.ID, ids.ShortID). */
  raw(bytes: Uint8Array): this {
    for (const b of bytes) this.buf.push(b);
    return this;
  }

  /** []byte: uint32 LE length, then bytes. */
  bytes(b: Uint8Array): this {
    this.u32(b.length);
    return this.raw(b);
  }

  /** A uint32 LE slice-length prefix (the caller then writes each item). */
  len(n: number): this {
    return this.u32(n);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.buf);
  }

  toHex(): `0x${string}` {
    let s = "";
    for (const b of this.buf) s += b.toString(16).padStart(2, "0");
    return `0x${s}`;
  }
}

/** Prepend the 2-byte LE codec-version prefix to a marshalled body. */
export function withVersion(body: Uint8Array): Uint8Array {
  const w = new Writer().u16(CODEC_VERSION);
  return w.raw(body).toBytes();
}

/** Hex of bytes, 0x-prefixed. */
export function toHex(bytes: Uint8Array): `0x${string}` {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return `0x${s}`;
}

/** Decode a 0x / bare hex string to bytes. */
export function fromHex(hexStr: string): Uint8Array {
  const clean = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr;
  if (clean.length % 2 !== 0) throw new Error("@luxwallet/tx: odd-length hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`@luxwallet/tx: bad hex at ${i}`);
    out[i] = byte;
  }
  return out;
}

/** A 32-byte id from hex (ids.ID / blockchainID / txid / assetID). */
export function id32(hexOrBytes: string | Uint8Array): Uint8Array {
  const b = typeof hexOrBytes === "string" ? fromHex(hexOrBytes) : hexOrBytes;
  if (b.length !== 32) throw new Error(`@luxwallet/tx: id must be 32 bytes, got ${b.length}`);
  return b;
}

/** A 20-byte short id from hex (ids.ShortID / address). */
export function addr20(hexOrBytes: string | Uint8Array): Uint8Array {
  const b = typeof hexOrBytes === "string" ? fromHex(hexOrBytes) : hexOrBytes;
  if (b.length !== 20) throw new Error(`@luxwallet/tx: address must be 20 bytes, got ${b.length}`);
  return b;
}
