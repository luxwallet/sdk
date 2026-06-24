/**
 * Lux P-Chain (platformvm) unsigned-tx builder — REAL, fully offline,
 * ZERO deps. Emits `Codec.Marshal(0, &tx.Unsigned)` byte-for-byte vs the
 * Lux SDK (luxfi/proto p/txs). Verified against golden vectors from the
 * pinned Go modules — see lux/platformvm.test.ts.
 *
 * Tx type-ids (P-Chain registration order, V1 codec):
 *   AddValidatorTx=12, AddDelegatorTx=14, ImportTx=17, ExportTx=18,
 *   BaseTx=34. (proto/p/txs codec.go RegisterTypes slot map.)
 *
 * Wire layout per kind (after the 2-byte LE version + uint32 LE type-id):
 *   BaseTx:        networkID(u32) blockchainID(32) outs[] ins[] memo
 *   ExportTx:      <BaseTx> destinationChain(32) exportedOutputs[]
 *   ImportTx:      <BaseTx> sourceChain(32) importedInputs[]
 *   AddValidatorTx:<BaseTx> validator stakeOuts[] rewardsOwner shares(u32)
 *   AddDelegatorTx:<BaseTx> validator stakeOuts[] rewardsOwner
 *     validator    = nodeID(20) start(u64) end(u64) weight(u64)
 *     rewardsOwner = type-id 11 (secp256k1fx.OutputOwners) ‖ locktime(u64)
 *                    threshold(u32) addrs[]
 *
 * NOTE: this builds the classic AddValidator/AddDelegator txs, which carry
 * NO BLS proof-of-possession (unlike AddPermissionlessValidatorTx) and so
 * are fully constructible offline. `digest` = sha256(unsigned bytes) (the
 * P-Chain tx id / the bytes the keyring hashes before signing). Never signs.
 */
import { Writer, addr20, fromHex, id32, toHex, withVersion } from "./codec.js";
import { writeInputs, writeOutputs, type LuxInput, type LuxOutput } from "./utxo.js";
import { sha256 } from "./hash.js";
import type { LuxOutputOwner, LuxPTxIntent, LuxValidator, UnsignedTx } from "../types.js";

const TYPE_ID = {
  addValidator: 12,
  addDelegator: 14,
  import: 17,
  export: 18,
  base: 34,
} as const;

const TYPE_ID_OUTPUT_OWNERS = 11;

function memoBytes(memo?: string): Uint8Array {
  return memo ? fromHex(memo) : new Uint8Array(0);
}

function toLuxOutputs(outs: LuxPTxIntent["outputs"]): LuxOutput[] {
  return outs.map((o) => ({
    assetId: o.assetId,
    amount: o.amount,
    locktime: o.locktime,
    threshold: o.threshold,
    addresses: o.addresses,
  }));
}

function toLuxInputs(ins: LuxPTxIntent["inputs"]): LuxInput[] {
  return ins.map((i) => ({
    txId: i.txId,
    outputIndex: i.outputIndex,
    assetId: i.assetId,
    amount: i.amount,
    sigIndices: i.sigIndices,
  }));
}

function writeBaseFields(w: Writer, intent: LuxPTxIntent): void {
  w.u32(intent.networkId);
  w.raw(id32(intent.blockchainId));
  writeOutputs(w, toLuxOutputs(intent.outputs));
  writeInputs(w, toLuxInputs(intent.inputs));
  w.bytes(memoBytes(intent.memo));
}

function writeValidator(w: Writer, v: LuxValidator): void {
  w.raw(addr20(v.nodeId)); // ids.NodeID is a 20-byte short id
  w.u64(BigInt(v.start));
  w.u64(BigInt(v.end));
  w.u64(BigInt(v.weight));
}

/** secp256k1fx.OutputOwners as the fx.Owner interface (type-id 11). */
function writeRewardsOwner(w: Writer, owner: LuxOutputOwner): void {
  const addrs = owner.addresses.map(addr20).sort(compareBytes);
  w.u32(TYPE_ID_OUTPUT_OWNERS);
  w.u64(BigInt(owner.locktime ?? 0));
  w.u32(owner.threshold ?? 1);
  w.len(addrs.length);
  for (const a of addrs) w.raw(a);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  return a.length - b.length;
}

/** Build an unsigned Lux P-Chain tx. */
export function buildPlatformvmUnsignedTx(intent: LuxPTxIntent): UnsignedTx {
  const w = new Writer();

  switch (intent.kind) {
    case "base":
      w.u32(TYPE_ID.base);
      writeBaseFields(w, intent);
      break;
    case "export":
      if (!intent.destinationChain) {
        throw new Error("@luxwallet/tx: lux P export requires destinationChain");
      }
      w.u32(TYPE_ID.export);
      writeBaseFields(w, intent);
      w.raw(id32(intent.destinationChain));
      writeOutputs(w, toLuxOutputs(intent.exportedOutputs ?? []));
      break;
    case "import":
      if (!intent.sourceChain) {
        throw new Error("@luxwallet/tx: lux P import requires sourceChain");
      }
      w.u32(TYPE_ID.import);
      writeBaseFields(w, intent);
      w.raw(id32(intent.sourceChain));
      writeInputs(w, toLuxInputs(intent.importedInputs ?? []));
      break;
    case "addValidator":
      requireStaking(intent);
      w.u32(TYPE_ID.addValidator);
      writeBaseFields(w, intent);
      writeValidator(w, intent.validator!);
      writeOutputs(w, toLuxOutputs(intent.stakeOutputs ?? []));
      writeRewardsOwner(w, intent.rewardsOwner!);
      w.u32(intent.delegationShares ?? 0);
      break;
    case "addDelegator":
      requireStaking(intent);
      w.u32(TYPE_ID.addDelegator);
      writeBaseFields(w, intent);
      writeValidator(w, intent.validator!);
      writeOutputs(w, toLuxOutputs(intent.stakeOutputs ?? []));
      writeRewardsOwner(w, intent.rewardsOwner!);
      break;
    default:
      throw new Error(`@luxwallet/tx: unknown lux P tx kind ${(intent as { kind: string }).kind}`);
  }

  const unsigned = withVersion(w.toBytes());
  const digest = sha256(unsigned);

  return {
    family: "lux-p",
    serialized: toHex(unsigned),
    digest: toHex(digest),
    summary: {
      chain: "Lux P-Chain",
      kind: intent.kind,
      networkId: String(intent.networkId),
      inputs: String(intent.inputs.length),
      outputs: String(intent.outputs.length),
      ...(intent.validator
        ? { nodeId: intent.validator.nodeId, weight: intent.validator.weight }
        : {}),
      ...(intent.destinationChain ? { destinationChain: intent.destinationChain } : {}),
      ...(intent.sourceChain ? { sourceChain: intent.sourceChain } : {}),
    },
  };
}

function requireStaking(intent: LuxPTxIntent): void {
  if (!intent.validator) throw new Error("@luxwallet/tx: lux P staking tx requires validator");
  if (!intent.rewardsOwner) throw new Error("@luxwallet/tx: lux P staking tx requires rewardsOwner");
}
