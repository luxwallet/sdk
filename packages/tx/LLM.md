# @luxwallet/tx — implementation notes

EVM is done. The non-EVM families are typed stubs (`builderStatus: "todo"`).
Each `build*UnsignedTx` throws `"builder todo"`. This file is the porting
plan; the authoritative Lux tx types live under `~/work/lux/node/vms`.

## EVM (done)

`buildEvmUnsignedTx` builds a canonical unsigned EIP-1559 (type 2) tx via
viem's `serializeTransaction` (no signature => unsigned `0x02 || rlp`). The
signer signs `keccak256(serialized)` and viem re-serializes with the sig.
Q-Chain (PQ-EVM) reuses this builder for the tx envelope but the **signature
scheme** is ML-DSA-65 (see @luxwallet/crypto + the precompile wire format in
its LLM.md) — that's a signer concern, not a builder change.

## P-Chain (platformvm) — TODO

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

## X-Chain (exchangevm / xvm) — TODO

Source: `~/work/lux/node/vms/xvm/txs/`. 8 UTXO tx types:
`BaseTx`, `CreateAssetTx`, `OperationTx`, `ImportTx`, `ExportTx`, plus the
`InitialState`/`Operation` building blocks. UTXO model: inputs reference
prior outputs; outputs name `OutputOwners`. For PQ-owned UTXOs the owners
are **full ML-DSA public keys** (1952 B), not 20-byte addresses — see
`luxfi/utxo/mldsafx`.

## Atomic import/export + Warp — TODO

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
