import { describe, expect, it } from "vitest";
import { buildXvmUnsignedTx } from "./xvm.js";
import { sha256 } from "./hash.js";
import type { LuxXTxIntent } from "../types.js";

// Golden vectors generated from the pinned Lux Go modules
// (luxfi/proto@v1.3.5 + luxfi/utxo@v0.3.7) via Codec.Marshal(0, &tx.Unsigned).
// The X BaseTx vector reproduces the canonical tx-id below — the same
// fixture as proto/x/txs/base_tx_test.go::TestBaseTxSerialization.

const NETWORK_ID = 369; // constants.UnitTestID
const BLOCKCHAIN = "0504030201" + "0".repeat(54); // ids.ID{5,4,3,2,1}
const ASSET = "010203" + "0".repeat(58); // ids.ID{1,2,3}
const ADDR = "fceda8f90fcb5d30614b99d79fc4baa293077626"; // TestKeys()[0] address
// ids.ID{0xff,0xfe,...,0xe0} — 32 bytes.
const TXID = "fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0";

const out0 = { assetId: ASSET, amount: "12345", threshold: 1, addresses: [ADDR] };
const input = { txId: TXID, outputIndex: 1, assetId: ASSET, amount: "54321", sigIndices: [2] };

const XBASE =
  "0x00000000000071010000050403020100000000000000000000000000000000000000000000000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa29307762601000000fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00100000001020300000000000000000000000000000000000000000000000000000000000500000031d400000000000001000000020000000400000000010203";

const XEXPORT =
  "0x0000040000007101000005040302010000000000000000000000000000000000000000000000000000000000000001000000fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00100000001020300000000000000000000000000000000000000000000000000000000000500000031d4000000000000010000000200000000000000090909000000000000000000000000000000000000000000000000000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa293077626";

const XIMPORT =
  "0x00000300000071010000050403020100000000000000000000000000000000000000000000000000000001000000010203000000000000000000000000000000000000000000000000000000000007000000393000000000000000000000000000000100000001000000fceda8f90fcb5d30614b99d79fc4baa2930776260000000000000000070707000000000000000000000000000000000000000000000000000000000001000000fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00100000001020300000000000000000000000000000000000000000000000000000000000500000031d40000000000000100000002000000";

describe("@luxwallet/tx Lux X-Chain builder (real, KAT vs Go SDK)", () => {
  it("BaseTx: bytes match the Go SDK golden AND the digest is sha256(bytes)", () => {
    const intent: LuxXTxIntent = {
      kind: "base",
      networkId: NETWORK_ID,
      blockchainId: BLOCKCHAIN,
      inputs: [input],
      outputs: [out0],
      memo: "00010203",
    };
    const tx = buildXvmUnsignedTx(intent);
    expect(tx.family).toBe("lux-x");
    expect(tx.serialized).toBe(XBASE);

    // digest = sha256(unsigned bytes) = the X-Chain tx id bytes.
    const bytes = Uint8Array.from(XBASE.slice(2).match(/../g)!.map((h) => parseInt(h, 16)));
    let want = "0x";
    for (const b of sha256(bytes)) want += b.toString(16).padStart(2, "0");
    expect(tx.digest).toBe(want);
  });

  it("ExportTx: bytes match the Go SDK golden (BaseTx + destinationChain + exportedOuts)", () => {
    const intent: LuxXTxIntent = {
      kind: "export",
      networkId: NETWORK_ID,
      blockchainId: BLOCKCHAIN,
      inputs: [input],
      outputs: [],
      memo: "",
      destinationChain: "090909" + "0".repeat(58),
      exportedOutputs: [out0],
    };
    const tx = buildXvmUnsignedTx(intent);
    expect(tx.serialized).toBe(XEXPORT);
  });

  it("ImportTx: bytes match the Go SDK golden (BaseTx + sourceChain + importedIns)", () => {
    const intent: LuxXTxIntent = {
      kind: "import",
      networkId: NETWORK_ID,
      blockchainId: BLOCKCHAIN,
      inputs: [],
      outputs: [out0],
      memo: "",
      sourceChain: "070707" + "0".repeat(58),
      importedInputs: [input],
    };
    const tx = buildXvmUnsignedTx(intent);
    expect(tx.serialized).toBe(XIMPORT);
  });

  it("sorts multiple outputs canonically (codec requires sorted outputs)", () => {
    // Two outputs that, unsorted, would be in the wrong order. The builder
    // must sort by (assetID, output wire bytes) so the tx verifies on-chain.
    const a = { assetId: ASSET, amount: "100", threshold: 1, addresses: [ADDR] };
    const b = { assetId: ASSET, amount: "200", threshold: 1, addresses: [ADDR] };
    const forward = buildXvmUnsignedTx({
      kind: "base",
      networkId: NETWORK_ID,
      blockchainId: BLOCKCHAIN,
      inputs: [input],
      outputs: [a, b],
    });
    const reversed = buildXvmUnsignedTx({
      kind: "base",
      networkId: NETWORK_ID,
      blockchainId: BLOCKCHAIN,
      inputs: [input],
      outputs: [b, a],
    });
    // Order-independent: sorting makes both inputs produce identical bytes.
    expect(forward.serialized).toBe(reversed.serialized);
  });

  it("rejects export without destinationChain / import without sourceChain", () => {
    const base = { networkId: NETWORK_ID, blockchainId: BLOCKCHAIN, inputs: [input], outputs: [out0] };
    expect(() => buildXvmUnsignedTx({ ...base, kind: "export" })).toThrow(/destinationChain/);
    expect(() => buildXvmUnsignedTx({ ...base, kind: "import" })).toThrow(/sourceChain/);
  });
});
