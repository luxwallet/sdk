/**
 * Lux UTXO primitives — the secp256k1fx TransferableOutput /
 * TransferableInput shared by the X-Chain (xvm) and P-Chain (platformvm)
 * wire formats. Encoded with the ZAP-native LE codec (lux/codec.ts).
 *
 * Wire layouts (verified vs luxfi/utxo@v0.3.7; see lux/xvm.test.ts KAT):
 *
 *   TransferableOutput:
 *     assetID            ids.ID (32 raw)
 *     out type-id        uint32 LE = 7 (secp256k1fx.TransferOutput)
 *     out.Amt            uint64 LE
 *     out.Locktime       uint64 LE
 *     out.Threshold      uint32 LE
 *     out.Addrs          uint32 LE count, then each addr (20 raw)
 *
 *   TransferableInput:
 *     txID               ids.ID (32 raw)
 *     outputIndex        uint32 LE
 *     assetID            ids.ID (32 raw)
 *     in type-id         uint32 LE = 5 (secp256k1fx.TransferInput)
 *     in.Amt             uint64 LE
 *     in.SigIndices      uint32 LE count, then each index (uint32 LE)
 *
 * Sorting: the Lux codec verifies outputs are sorted by (assetID, output
 * wire bytes) and inputs by (txID, outputIndex). We sort both so the
 * produced tx passes SyntacticVerify on-chain.
 */
import { Writer, addr20, id32 } from "./codec.js";

const TYPE_ID_TRANSFER_OUTPUT = 7;
const TYPE_ID_TRANSFER_INPUT = 5;

/** A secp256k1fx transfer output (recipient or change). */
export interface LuxOutput {
  /** 32-byte asset id (hex). The LUX asset id on the target chain. */
  assetId: string;
  /** Amount, base units (decimal string or bigint). */
  amount: string | bigint;
  /** Spendable at/after this unix time. Default 0. */
  locktime?: string | bigint;
  /** Signatures required to spend. Default 1. */
  threshold?: number;
  /** Owner addresses (20-byte hex), sorted ascending by the codec. */
  addresses: string[];
}

/** A secp256k1fx transfer input (a UTXO being spent). */
export interface LuxInput {
  /** 32-byte funding tx id (hex). */
  txId: string;
  /** Output index in the funding tx. */
  outputIndex: number;
  /** 32-byte asset id (hex). */
  assetId: string;
  /** Amount held by the consumed UTXO (decimal string or bigint). */
  amount: string | bigint;
  /** Indices into the UTXO's owner set that will sign. Default [0]. */
  sigIndices?: number[];
}

function writeOutput(w: Writer, o: LuxOutput): void {
  // Addrs MUST be sorted ascending (codec verifies sorted+unique).
  const addrs = o.addresses.map(addr20).sort(compareBytes);
  w.raw(id32(o.assetId));
  w.u32(TYPE_ID_TRANSFER_OUTPUT);
  w.u64(BigInt(o.amount));
  w.u64(BigInt(o.locktime ?? 0));
  w.u32(o.threshold ?? 1);
  w.len(addrs.length);
  for (const a of addrs) w.raw(a);
}

function writeInput(w: Writer, i: LuxInput): void {
  const sig = (i.sigIndices ?? [0]).slice().sort((a, b) => a - b);
  w.raw(id32(i.txId));
  w.u32(i.outputIndex);
  w.raw(id32(i.assetId));
  w.u32(TYPE_ID_TRANSFER_INPUT);
  w.u64(BigInt(i.amount));
  w.len(sig.length);
  for (const s of sig) w.u32(s);
}

/** Canonical full TransferableOutput wire bytes (for sorting + encoding). */
export function outputBytes(o: LuxOutput): Uint8Array {
  const w = new Writer();
  writeOutput(w, o);
  return w.toBytes();
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

/**
 * Write a sorted list of TransferableOutputs (count + each). Sorted by
 * (assetID, full output wire bytes) per the Lux codec's canonical order.
 */
export function writeOutputs(w: Writer, outs: LuxOutput[]): void {
  const sorted = outs
    .map((o) => ({ o, bytes: outputBytes(o) }))
    .sort((x, y) => compareBytes(x.bytes, y.bytes));
  w.len(sorted.length);
  for (const { o } of sorted) writeOutput(w, o);
}

/**
 * Write a sorted list of TransferableInputs (count + each). Sorted by
 * (txID, outputIndex) per the Lux codec's canonical order.
 */
export function writeInputs(w: Writer, ins: LuxInput[]): void {
  const sorted = ins.slice().sort((a, b) => {
    const c = compareBytes(id32(a.txId), id32(b.txId));
    return c !== 0 ? c : a.outputIndex - b.outputIndex;
  });
  w.len(sorted.length);
  for (const i of sorted) writeInput(w, i);
}
