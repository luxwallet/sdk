/**
 * Hash helper for the Lux-native builders. The X/P/Z-Chain tx id (and the
 * bytes hashed before signing) is the SHA-256 of the unsigned tx bytes.
 *
 * Lib: @noble/hashes (MIT) — audited, dependency-free, isomorphic
 * (browser/node/react-native). We bind it rather than hand-roll SHA-256
 * (reimplementing audited crypto is a correctness + security risk).
 */
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

/** SHA-256 of `data`. */
export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}
