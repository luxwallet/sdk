/**
 * @luxwallet/tx — per-VM transaction builders.
 *
 * EVM (`buildEvmUnsignedTx`) is real, via viem. The P/X/UTXO/SVM builders
 * are typed stubs (`builderStatus: "todo"`); see LLM.md for the Lux tx-type
 * plan. The signer (@luxwallet/keyring + @luxwallet/crypto) consumes the
 * `UnsignedTx.serialized` bytes; this package never signs.
 */
export * from "./types.js";
export { buildEvmUnsignedTx } from "./evm.js";
export {
  BUILDER_STATUS,
  buildPlatformUnsignedTx,
  buildExchangeUnsignedTx,
  buildUtxoUnsignedTx,
  buildSvmUnsignedTx,
} from "./stubs.js";
