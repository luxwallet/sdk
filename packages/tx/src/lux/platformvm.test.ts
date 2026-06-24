import { describe, expect, it } from "vitest";
import { buildPlatformvmUnsignedTx } from "./platformvm.js";
import { sha256 } from "./hash.js";
import type { LuxPTxIntent } from "../types.js";

// Golden vectors from the pinned Lux Go modules (luxfi/proto@v1.3.5 +
// luxfi/utxo@v0.3.7) via Codec.Marshal(0, &tx.Unsigned). Same fixture
// values as proto/p/txs tests.

const NETWORK_ID = 369;
const BLOCKCHAIN = "0504030201" + "0".repeat(54);
const ASSET = "010203" + "0".repeat(58);
const ADDR = "fceda8f90fcb5d30614b99d79fc4baa293077626";
const TXID = "fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0";
const NODE = "112233" + "0".repeat(34); // ids.NodeID{0x11,0x22,0x33} (20 bytes)

const out0 = { assetId: ASSET, amount: "12345", threshold: 1, addresses: [ADDR] };
const input = { txId: TXID, outputIndex: 1, assetId: ASSET, amount: "54321", sigIndices: [2] };
const validator = { nodeId: NODE, start: 1000, end: 2000, weight: "5000000" };
const rewards = { threshold: 1, addresses: [ADDR] };

const PBASE =
  "0x00002200000071010000050403020100000000000000000000000000000000000000000000000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa29307762601000000fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00100000001020300000000000000000000000000000000000000000000000000000000000500000031d400000000000001000000020000000400000000010203";

const PEXPORT =
  "0x0000120000007101000005040302010000000000000000000000000000000000000000000000000000000000000001000000fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00100000001020300000000000000000000000000000000000000000000000000000000000500000031d4000000000000010000000200000000000000090909000000000000000000000000000000000000000000000000000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa293077626";

const PIMPORT =
  "0x00001100000071010000050403020100000000000000000000000000000000000000000000000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa2930776260000000000000000070707000000000000000000000000000000000000000000000000000000000001000000fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00100000001020300000000000000000000000000000000000000000000000000000000000500000031d40000000000000100000002000000";

const PADDVALIDATOR =
  "0x00000c00000071010000050403020100000000000000000000000000000000000000000000000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa29307762601000000fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00100000001020300000000000000000000000000000000000000000000000000000000000500000031d4000000000000010000000200000004000000000102031122330000000000000000000000000000000000e803000000000000d007000000000000404b4c000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa2930776260b00000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa293077626204e0000";

const PADDDELEGATOR =
  "0x00000e00000071010000050403020100000000000000000000000000000000000000000000000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa29307762601000000fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00100000001020300000000000000000000000000000000000000000000000000000000000500000031d4000000000000010000000200000004000000000102031122330000000000000000000000000000000000e803000000000000d007000000000000404b4c000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa2930776260b00000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa293077626";

const base = { networkId: NETWORK_ID, blockchainId: BLOCKCHAIN, inputs: [input], outputs: [out0] };

describe("@luxwallet/tx Lux P-Chain builder (real, KAT vs Go SDK)", () => {
  it("BaseTx: bytes match the Go SDK golden; digest = sha256(bytes)", () => {
    const tx = buildPlatformvmUnsignedTx({ ...base, kind: "base", memo: "00010203" });
    expect(tx.family).toBe("lux-p");
    expect(tx.serialized).toBe(PBASE);
    const bytes = Uint8Array.from(PBASE.slice(2).match(/../g)!.map((h) => parseInt(h, 16)));
    let want = "0x";
    for (const b of sha256(bytes)) want += b.toString(16).padStart(2, "0");
    expect(tx.digest).toBe(want);
  });

  it("ExportTx: bytes match the Go SDK golden", () => {
    const tx = buildPlatformvmUnsignedTx({
      kind: "export",
      networkId: NETWORK_ID,
      blockchainId: BLOCKCHAIN,
      inputs: [input],
      outputs: [],
      memo: "",
      destinationChain: "090909" + "0".repeat(58),
      exportedOutputs: [out0],
    });
    expect(tx.serialized).toBe(PEXPORT);
  });

  it("ImportTx: bytes match the Go SDK golden", () => {
    const tx = buildPlatformvmUnsignedTx({
      kind: "import",
      networkId: NETWORK_ID,
      blockchainId: BLOCKCHAIN,
      inputs: [],
      outputs: [out0],
      memo: "",
      sourceChain: "070707" + "0".repeat(58),
      importedInputs: [input],
    });
    expect(tx.serialized).toBe(PIMPORT);
  });

  it("AddValidatorTx: bytes match the Go SDK golden (validator + stake + rewards + shares)", () => {
    const tx = buildPlatformvmUnsignedTx({
      ...base,
      kind: "addValidator",
      memo: "00010203",
      validator,
      stakeOutputs: [out0],
      rewardsOwner: rewards,
      delegationShares: 20000,
    });
    expect(tx.serialized).toBe(PADDVALIDATOR);
    expect(tx.summary.nodeId).toBe(NODE);
    expect(tx.summary.weight).toBe("5000000");
  });

  it("AddDelegatorTx: bytes match the Go SDK golden (validator + stake + rewards, no shares)", () => {
    const tx = buildPlatformvmUnsignedTx({
      ...base,
      kind: "addDelegator",
      memo: "00010203",
      validator,
      stakeOutputs: [out0],
      rewardsOwner: rewards,
    });
    expect(tx.serialized).toBe(PADDDELEGATOR);
  });

  it("rejects staking txs without a validator / rewardsOwner", () => {
    expect(() => buildPlatformvmUnsignedTx({ ...base, kind: "addValidator" })).toThrow(/validator/);
    expect(() =>
      buildPlatformvmUnsignedTx({ ...base, kind: "addValidator", validator }),
    ).toThrow(/rewardsOwner/);
  });
});
