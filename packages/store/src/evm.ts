/**
 * Pure EVM operations over the injected chain provider + crypto engine.
 *
 * Signing never leaves the private key with a second signer: ethers is used
 * only for RLP / EIP-1559 encoding and address math; the secp256k1 signature
 * comes from the injected engine over the keccak256 tx digest, and the
 * recovered signer is checked against the sender before broadcast.
 */
import { ethers } from "ethers";

import { addressFromPubkey } from "./account.js";
import { fromHex, toHex } from "./hex.js";
import type { Balance, ChainProvider, CryptoEngine } from "./types.js";

/** Native-asset balance for `address` on `chainId`. Never throws — RPC/decode
 * failures return wei '0' with an `error`, formatted by the chain's decimals. */
export async function getBalance(
  chains: ChainProvider,
  chainId: number,
  address: string,
): Promise<Balance> {
  const chain = chains.chainById(chainId);
  const decimals = chain?.nativeAsset.decimals ?? 18;
  const symbol = chain?.nativeAsset.symbol ?? "ETH";
  try {
    const hex = await chains.rpcClient(chainId).call<string>({
      method: "eth_getBalance",
      params: [address, "latest"],
    });
    const wei = BigInt(hex);
    return {
      wei: wei.toString(),
      formatted: ethers.formatUnits(wei, decimals),
      symbol,
    };
  } catch (e) {
    return {
      wei: "0",
      formatted: "0",
      symbol,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Inputs the store resolves (account address + sealed key) before signing. */
export interface SignAndSendEvmParams {
  from: string;
  pkHex: string;
  chainId: number;
  to: string;
  amountEther: string;
  data?: string;
}

/**
 * Build, sign, self-check, and broadcast an EIP-1559 (type-2) transfer. The
 * recovered signer MUST equal `from` or the tx is never broadcast.
 */
export async function signAndSendEvm(
  engine: CryptoEngine,
  chains: ChainProvider,
  p: SignAndSendEvmParams,
): Promise<{ hash: string }> {
  const from = p.from;
  const toAddr = ethers.getAddress(p.to);
  const value = ethers.parseEther(p.amountEther);
  const client = chains.rpcClient(p.chainId);

  const nonce = await client.getTransactionCount(from);
  const [gasHex, gasPriceHex] = await Promise.all([
    client.call<string>({
      method: "eth_estimateGas",
      params: [{ from, to: toAddr, value: ethers.toBeHex(value) }],
    }),
    client.call<string>({ method: "eth_gasPrice", params: [] }),
  ]);
  const gasLimit = BigInt(gasHex);
  const gasPrice = BigInt(gasPriceHex);
  const maxPriorityFeePerGas = ethers.parseUnits("1.5", "gwei");
  const maxFeePerGas = gasPrice * BigInt(2) + maxPriorityFeePerGas;

  const tx = ethers.Transaction.from({
    type: 2,
    chainId: p.chainId,
    nonce,
    to: toAddr,
    value,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data: p.data ?? "0x",
  });

  const digest = ethers.getBytes(tx.unsignedHash);
  const sig = engine.secp256k1.sign(fromHex(p.pkHex), digest);

  // Self-check: the recovered signer must be this account.
  const recovered = engine.secp256k1.recover(digest, sig);
  if (addressFromPubkey(engine, recovered).toLowerCase() !== from.toLowerCase()) {
    throw new Error("signature self-check failed");
  }

  const recid = (sig[64] as number) >= 27 ? (sig[64] as number) - 27 : (sig[64] as number);
  tx.signature = ethers.Signature.from({
    r: toHex(sig.slice(0, 32)),
    s: toHex(sig.slice(32, 64)),
    yParity: (recid & 1) as 0 | 1,
  });

  const hash = await client.call<string>({
    method: "eth_sendRawTransaction",
    params: [tx.serialized],
  });
  return { hash };
}
