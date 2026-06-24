/**
 * Polkadot (substrate) `balances.transferKeepAlive` builder — PARTIAL.
 *
 * Lib: @polkadot/types + @polkadot/util (Apache-2.0). A correct unsigned
 * SIGNING PAYLOAD for a substrate extrinsic cannot be produced offline
 * without the runtime **metadata** (to SCALE-encode the call) plus the
 * mortality/nonce/version context. This builder does NOT connect to a
 * node: the caller supplies the metadata + era/nonce/genesisHash/
 * blockHash/specVersion/transactionVersion (fetched via `state_getMetadata`,
 * `chain_getBlockHash`, `state_getRuntimeVersion`,
 * `system_accountNextIndex`). Given those, it builds the real call and the
 * exact `ExtrinsicPayload` the signer signs.
 *
 * Output: `serialized` = the SCALE-encoded extrinsic signing payload
 * (`{ method, era, nonce, tip, specVersion, transactionVersion,
 * genesisHash, blockHash }`); `digest` = the same bytes (substrate signs
 * the payload, blake2-hashing it first if > 256 bytes — the signer does
 * that). This package never signs.
 *
 * BuilderStatus: "ready" — emits the complete GenericExtrinsicPayload
 * signing bytes from the intent. The intent carries the standard substrate
 * chain-state (runtime metadata + era/nonce/genesisHash/specVersion/
 * transactionVersion), the same contract as every builder needing
 * caller-supplied state (EVM's nonce/gas, Solana's blockhash).
 */
import { TypeRegistry, Metadata, GenericExtrinsicPayload } from "@polkadot/types";
import { expandMetadata } from "@polkadot/types/metadata";
import { u8aToHex } from "@polkadot/util";
import type { PolkadotTxIntent, UnsignedTx } from "./types.js";

const EXTRINSIC_VERSION = 4;

/** Build the unsigned Polkadot transferKeepAlive signing payload. */
export function buildPolkadotUnsignedTx(intent: PolkadotTxIntent): UnsignedTx {
  if (BigInt(intent.amount) <= 0n) {
    throw new Error("@luxwallet/tx: polkadot amount must be > 0");
  }

  const registry = new TypeRegistry();
  // Decoding metadata registers all runtime types (the call's arg codecs).
  const metadata = new Metadata(registry, intent.metadata);
  registry.setMetadata(metadata);

  // Version-stable call construction: the decorated `tx` map yields the
  // exact Call for balances.transferKeepAlive(dest, value) from metadata.
  const decorated = expandMetadata(registry, metadata);
  const balances = decorated.tx.balances;
  const transferKeepAlive = balances?.transferKeepAlive;
  if (!transferKeepAlive) {
    throw new Error(
      "@luxwallet/tx: supplied metadata has no balances.transferKeepAlive call",
    );
  }
  const call = transferKeepAlive(intent.dest, BigInt(intent.amount));

  const era = intent.era ?? "0x00"; // immortal by default
  const payload = new GenericExtrinsicPayload(
    registry,
    {
      method: call.toHex(),
      era,
      nonce: intent.nonce,
      tip: intent.tip ?? "0",
      specVersion: intent.specVersion,
      transactionVersion: intent.transactionVersion,
      genesisHash: intent.genesisHash,
      blockHash: intent.blockHash,
    },
    { version: EXTRINSIC_VERSION },
  );

  // The bytes the signer signs (method included). The signer blake2-256
  // hashes this if it exceeds 256 bytes (substrate rule) before signing.
  const signingBytes = payload.toU8a({ method: true });
  const serialized = u8aToHex(signingBytes) as `0x${string}`;

  return {
    family: "substrate",
    serialized,
    digest: serialized,
    summary: {
      chain: "Polkadot",
      call: "balances.transferKeepAlive",
      dest: intent.dest,
      amount: intent.amount,
      dot: (Number(BigInt(intent.amount)) / 1e10).toString(),
      nonce: String(intent.nonce),
      tip: intent.tip ?? "0",
      specVersion: String(intent.specVersion),
      transactionVersion: String(intent.transactionVersion),
      mortality: era === "0x00" ? "immortal" : "mortal",
    },
  };
}
