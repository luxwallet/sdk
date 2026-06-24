import { describe, expect, it } from "vitest";
import { TypeRegistry, Metadata } from "@polkadot/types";
import { expandMetadata } from "@polkadot/types/metadata";
// Real Polkadot V14 runtime metadata (Apache-2.0 test fixture). Stands in
// for the metadata a caller fetches via `state_getMetadata` at runtime.
import polkadotMetadataHex from "@polkadot/types-support/metadata/static-polkadot";
import { buildPolkadotUnsignedTx } from "./polkadot.js";

const DEST = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"; // Alice
const GENESIS = `0x${"91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3"}` as const;

describe("@luxwallet/tx Polkadot builder (partial — caller supplies metadata)", () => {
  const intent = {
    dest: DEST,
    amount: "12345000000", // 1.2345 DOT (1e10 planck/DOT)
    nonce: 3,
    genesisHash: GENESIS,
    blockHash: GENESIS, // immortal => anchors to genesis
    specVersion: 9430,
    transactionVersion: 24,
    metadata: polkadotMetadataHex as `0x${string}`,
  };

  it("builds a signing payload (0x hex); serialized === digest", () => {
    const tx = buildPolkadotUnsignedTx(intent);
    expect(tx.family).toBe("substrate");
    expect(tx.serialized).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.digest).toBe(tx.serialized);
  });

  // The signing payload (`toU8a({ method: true })`) is un-decodable as a
  // struct BY DESIGN — the method carries no length prefix (see
  // polkadot-js ExtrinsicPayloadV4.sign: "the data-as-signed is
  // un-decodable"). So we don't decode the payload; we independently
  // rebuild the call from metadata and assert it is the payload's prefix.
  function refCall() {
    const registry = new TypeRegistry();
    const metadata = new Metadata(registry, polkadotMetadataHex as `0x${string}`);
    registry.setMetadata(metadata);
    // Construct the call from metadata (the version-stable decorated tx
    // map). Asserting its decoded section/method/args below proves the
    // call is the real balances.transferKeepAlive — the metadata, not the
    // builder, defines those, so this is an independent check.
    const tx = expandMetadata(registry, metadata).tx;
    const call = tx.balances!.transferKeepAlive!(DEST, BigInt(intent.amount));
    return { registry, call };
  }

  it("embeds a real balances.transferKeepAlive call (the payload prefix)", () => {
    const tx = buildPolkadotUnsignedTx(intent);
    const { call } = refCall();
    expect(call.section).toBe("balances");
    expect(call.method).toBe("transferKeepAlive");
    // The signing payload begins with the SCALE-encoded method.
    expect(tx.serialized.slice(2).startsWith(call.toHex().slice(2))).toBe(true);
  });

  it("encodes the destination + amount into the call args", () => {
    const { call } = refCall();
    // args: [dest: MultiAddress, value: Compact<Balance>]
    expect(call.args[1]?.toString()).toBe("12345000000");
    // dest is a MultiAddress::Id wrapping Alice's 32-byte public key
    // (prefix-independent — the registry re-encodes SS58 with Polkadot's
    // network prefix, but the underlying key is invariant).
    const dest = call.args[0] as unknown as { value: { toHex(): string } };
    expect(dest.value.toHex()).toBe(
      "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d",
    );
  });

  it("emits the COMPLETE signing payload — byte-for-byte vs an independently built GenericExtrinsicPayload", async () => {
    // Reconstruct the full ExtrinsicPayload from the intent fields (the
    // canonical signable bytes) and assert the builder's output equals it
    // EXACTLY. This proves a complete payload (method + era + nonce + tip +
    // specVersion + transactionVersion + genesisHash + blockHash), not just
    // a correct prefix — the bar for "ready".
    const { GenericExtrinsicPayload } = await import("@polkadot/types");
    const { registry, call } = refCall();
    const ref = new GenericExtrinsicPayload(
      registry,
      {
        method: call.toHex(),
        era: "0x00",
        nonce: intent.nonce,
        tip: "0",
        specVersion: intent.specVersion,
        transactionVersion: intent.transactionVersion,
        genesisHash: GENESIS,
        blockHash: GENESIS,
      },
      { version: 4 },
    );
    const refHex = ref.toU8a({ method: true });
    let refStr = "0x";
    for (const b of refHex) refStr += b.toString(16).padStart(2, "0");

    const tx = buildPolkadotUnsignedTx(intent);
    expect(tx.serialized).toBe(refStr);
  });

  it("encodes a mortal era + non-zero tip into the payload (not just immortal)", () => {
    // Era "0x4503" is a real SCALE mortal era. Assert the builder threads
    // both through so the payload is complete for mortal txs too.
    const mortal = buildPolkadotUnsignedTx({ ...intent, era: "0x4503", tip: "1000000000" });
    expect(mortal.summary.mortality).toBe("mortal");
    expect(mortal.summary.tip).toBe("1000000000");
    // The immortal payload and the mortal one must differ (era/tip change
    // the signed bytes), proving those fields are actually encoded.
    const immortal = buildPolkadotUnsignedTx(intent);
    expect(mortal.serialized).not.toBe(immortal.serialized);
  });

  it("rejects non-positive amounts", () => {
    expect(() => buildPolkadotUnsignedTx({ ...intent, amount: "0" })).toThrow(/> 0/);
  });
});
