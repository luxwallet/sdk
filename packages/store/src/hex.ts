/**
 * Pure byte/hex helpers.
 *
 * The crypto ENGINE itself is injected by the consumer through
 * {@link WalletEngineConfig.crypto} (a structural {@link CryptoEngine}) — this
 * package never imports a crypto binary, so it stays bundler-agnostic. This
 * module holds only the two pure conversions the store and its helpers share.
 */

/** Lowercase 0x-hex of a byte array. */
export function toHex(bytes: Uint8Array): string {
  let s = "0x";
  for (let i = 0; i < bytes.length; i += 1) {
    s += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return s;
}

/** Parse 0x-hex (or bare hex) into bytes. */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
