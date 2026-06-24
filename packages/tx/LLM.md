# @luxwallet/tx — implementation notes

EVM + all six external bridge chains (Solana, XRP, TON, Bitcoin, Polkadot,
Cardano) are implemented. Only the **Lux-native** non-EVM families
(P-Chain, X-Chain, atomic/Warp, Z-Chain) remain typed stubs
(`builderStatus: "todo"`). This file is the porting plan for those; the
authoritative Lux tx types live under `~/work/lux/node/vms`.

Builders produce the canonical **UNSIGNED** encoding only — signing is
@luxwallet/keyring + @luxwallet/crypto. `UnsignedTx.serialized` is the
unsigned container; `UnsignedTx.digest` (when present) is the exact
bytes-to-sign where they differ from `serialized`.

## EVM (ready)

`buildEvmUnsignedTx` builds a canonical unsigned EIP-1559 (type 2) tx via
viem's `serializeTransaction` (no signature => unsigned `0x02 || rlp`). The
signer signs `keccak256(serialized)` and viem re-serializes with the sig.
Q-Chain (PQ-EVM) reuses this builder for the tx envelope but the **signature
scheme** is ML-DSA-65 (see @luxwallet/crypto + the precompile wire format in
its LLM.md) — that's a signer concern, not a builder change.

## External bridge chains (Lux Bridge supportedChains)

Each builder is one file (`<chain>.ts`) over a permissive offline lib. See
`BUILDER_STATUS` in `index.ts` for the authoritative readiness table.

| Chain    | fn                       | lib (license)                              | status  | bytes-to-sign (`digest`) |
|----------|--------------------------|--------------------------------------------|---------|--------------------------|
| solana   | `buildSolanaUnsignedTx`  | @solana/web3.js (MIT)                       | ready   | compiled message bytes   |
| xrp      | `buildXrpUnsignedTx`     | xrpl (ISC)                                  | ready   | `encodeForSigning` blob (STX-prefixed) |
| ton      | `buildTonUnsignedTx`     | @ton/core (MIT)                             | ready*  | message Cell hash; `serialized`=message BOC |
| bitcoin  | `buildBitcoinUnsignedTx` | @scure/btc-signer (MIT)                     | ready   | (PSBT; signer derives per-input sighashes) |
| polkadot | `buildPolkadotUnsignedTx`| @polkadot/types + util (Apache-2.0)         | partial | `ExtrinsicPayload.toU8a({method:true})` |
| cardano  | `buildCardanoUnsignedTx` | @emurgo/cardano-serialization-lib (MIT)     | partial | blake2b-256 tx-body hash; `serialized`=body CBOR |

`partial` = the cryptographic payload is real, but the CALLER must supply
chain state the offline builder cannot derive:
- **polkadot**: runtime **metadata** (to SCALE-encode the call) + era /
  nonce / genesisHash / specVersion / transactionVersion. The signing
  payload is un-decodable as a struct by design (method has no length
  prefix — see polkadot-js `ExtrinsicPayloadV4.sign`); tests assert it via
  the independently-rebuilt call being the payload prefix.
- **cardano**: the UTXO set, the exact outputs (incl. change), the `fee`
  (depends on protocol params + witness count) and `ttl`. WASM lib —
  `buildCardanoUnsignedTx` is **async** and lazy-`import()`s the module to
  keep it off the sync path.

*TON: the inner transfer **message** is fully built; the outer wallet-
contract cell (`seqno || valid_until || send_mode || ref(msg)`) that is
actually signed is wallet-version-specific (v3R2/v4R2/v5) and belongs to
the keyring. `seqno`/`sendMode` ride in the summary for the signer.

To promote polkadot/cardano to `ready`, add a chain-state layer
(metadata fetch for polkadot; coin-selection + fee-estimation for cardano)
so the builder is self-contained from the intent alone.

## Lux-native families — TODO (typed stubs in stubs.ts)

These remain unimplemented; `build{Platform,Exchange,Utxo,Zk}UnsignedTx`
throw `"builder todo"`. `STUB_BUILDER_STATUS` marks them all `todo`.

### P-Chain (platformvm) — TODO

Source: `~/work/lux/node/vms/platformvm/txs/` (each `*_tx.go`). ~26 tx
types, including:
- Staking: `AddValidatorTx`, `AddDelegatorTx`,
  `AddPermissionlessValidatorTx`, `AddPermissionlessDelegatorTx`,
  `AddSubnetValidatorTx` (Lux nomenclature), `RemoveSubnetValidatorTx`,
  `TransferSubnetOwnershipTx`.
- Chain/network lifecycle: `CreateChainTx`, `CreateSubnetTx`,
  `CreateNetworkTx`, `CreateSovereignL1Tx`, `ConvertNetworkToL1Tx`,
  `TransformSubnetTx`.
- L1 validator mgmt: `DisableL1ValidatorTx`, `IncreaseL1ValidatorBalanceTx`,
  `RegisterL1ValidatorTx`, `SetL1ValidatorWeightTx`.
- Value movement / atomic: `BaseTx`, `ImportTx`, `ExportTx`,
  `AdvanceTimeTx`, `RewardValidatorTx`.

Encoding is the Lux codec (linearcodec) — port the marshalling, do NOT
hand-roll RLP. Reference the codec wiring in `platformvm/txs/codec.go`.

### X-Chain (exchangevm / xvm) — TODO

Source: `~/work/lux/node/vms/xvm/txs/`. 8 UTXO tx types:
`BaseTx`, `CreateAssetTx`, `OperationTx`, `ImportTx`, `ExportTx`, plus the
`InitialState`/`Operation` building blocks. UTXO model: inputs reference
prior outputs; outputs name `OutputOwners`. For PQ-owned UTXOs the owners
are **full ML-DSA public keys** (1952 B), not 20-byte addresses — see
`luxfi/utxo/mldsafx`.

### Atomic import/export + Warp — TODO

Cross-chain movement uses atomic `ImportTx`/`ExportTx` on both P and X, and
Warp messages for L1↔L1. Reference `~/work/lux/node/vms/*/txs/*import*` /
`*export*` and the Warp signer in the node. These belong in the `utxo`
builder family.

## Hard rules

- Builders produce **unsigned** bytes only. Signing is
  @luxwallet/keyring + @luxwallet/crypto.
- Use the Lux codec for P/X encoding; viem only for EVM.
- Keep `builderStatus` honest: flip to `"ready"` only when there's a tested
  round-trip against a node fixture.
