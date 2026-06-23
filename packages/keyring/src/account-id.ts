/**
 * AccountID derivation. Mirrors lux/sdk/wallet/account/cshake.go:
 *
 *   AccountID = cSHAKE-256(N="LUX_ACCOUNT_V1", S="LUX/WALLET/ACCOUNT_ID/V1",
 *                          msg = u32be(networkId) ‖ u8(scheme) ‖ pubkey,
 *                          outLen = 48)
 *
 * The byte-framing here is REAL and authoritative. The cSHAKE primitive
 * itself comes from @luxwallet/crypto (luxfi/crypto), so this function is
 * async and throws "not yet bound" until the crypto backend is injected.
 *
 * NOTE: @luxwallet/crypto exposes raw SHAKE256 via `shake256`. cSHAKE adds
 * the NIST SP 800-185 N/S framing on top. The crypto backend MUST expose a
 * cSHAKE entry point (or this module must apply the bytepad framing) so the
 * output matches the Go side byte-for-byte — tracked in keyring LLM.md.
 */
import { crypto } from "@luxwallet/crypto";
import { ACCOUNT_ID_SIZE, type SchemeId } from "./types.js";

/** cSHAKE function name (N) for AccountID — matches Go `accountIDLabel`. */
export const ACCOUNT_ID_LABEL = "LUX_ACCOUNT_V1";
/** cSHAKE customization (S) for AccountID — matches Go constant. */
export const ACCOUNT_ID_CUSTOMIZATION = "LUX/WALLET/ACCOUNT_ID/V1";

/** Frame the cSHAKE message: u32be(networkId) ‖ u8(scheme) ‖ pubkey. */
export function accountIdMessage(networkId: number, scheme: SchemeId, pubkey: Uint8Array): Uint8Array {
  if (networkId < 0 || networkId > 0xffffffff) {
    throw new Error(`@luxwallet/keyring: networkId ${networkId} out of u32 range`);
  }
  const msg = new Uint8Array(4 + 1 + pubkey.length);
  const view = new DataView(msg.buffer);
  view.setUint32(0, networkId, false); // big-endian
  msg[4] = scheme & 0xff;
  msg.set(pubkey, 5);
  return msg;
}

/**
 * Derive the 48-byte AccountID for a (networkId, scheme, pubkey) triple.
 * Returns lowercase hex. Async because it goes through the crypto backend.
 *
 * Until the backend exposes cSHAKE, this delegates to `crypto().shake256`
 * which throws "not yet bound" — see keyring LLM.md for the cSHAKE framing
 * requirement.
 */
export async function deriveAccountId(
  networkId: number,
  scheme: SchemeId,
  pubkey: Uint8Array,
): Promise<string> {
  const msg = accountIdMessage(networkId, scheme, pubkey);
  // TODO(keyring): cSHAKE-256 with N/S framing, not bare shake256. The
  // crypto backend must add a cshake256(n, s, msg, outLen) op so this
  // matches lux/sdk/wallet/account/cshake.go. shake256 here is a
  // placeholder that throws until the backend is bound.
  const out = await crypto().shake256(msg, ACCOUNT_ID_SIZE);
  return toHex(out);
}

function toHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}
