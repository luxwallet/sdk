/**
 * Test doubles shared by the store tests. NOT shipped (excluded from the build).
 *
 * `fakeEngine` is a deterministic, internally-consistent {@link CryptoEngine}:
 * `deriveSecp256k1` addresses agree with `addressFromPubkey(getPublicKey(sk))`,
 * and `sign` records the signer so `recover` returns the same pubkey — the
 * store's send self-check passes for honest signatures and fails under `tamper`.
 */
import type { ChainEntry } from "@luxwallet/chains";

import { toHex } from "./hex.js";
import type { ChainProvider, CryptoEngine, RpcClientLike } from "./types.js";

/** Deterministic 32-byte digest — a test double for keccak256, not cryptographic. */
export function fakeHash(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  let acc = 0x9e3779b9 >>> 0;
  for (let i = 0; i < data.length; i += 1) {
    acc = Math.imul(acc ^ data[i]!, 0x01000193) >>> 0;
    out[i % 32] = (out[i % 32]! + (acc & 0xff)) & 0xff;
  }
  for (let i = 0; i < 32; i += 1) {
    acc = Math.imul(acc ^ (i + 1), 0x01000193) >>> 0;
    out[i] = (out[i]! ^ (acc & 0xff)) & 0xff;
  }
  return out;
}

const h32 = (s: string): Uint8Array => fakeHash(new TextEncoder().encode(s));

/** 65-byte uncompressed pubkey deterministically from a secret key. */
function pubOf(sk: Uint8Array): Uint8Array {
  const p = new Uint8Array(65);
  p[0] = 0x04;
  p.set(sk, 1);
  for (let i = 0; i < 32; i += 1) p[33 + i] = sk[i]! ^ 0xff;
  return p;
}

export interface FakeEngineOpts {
  /** recid byte the fake `sign` emits at sig[64] (default 27). */
  recid?: number;
  /** When true, `recover` returns a DIFFERENT pubkey → self-check fails. */
  tamper?: boolean;
}

/** A deterministic CryptoEngine test double. */
export function fakeEngine(opts: FakeEngineOpts = {}): CryptoEngine {
  const signed = new Map<string, Uint8Array>();
  return {
    keccak256: (d) => fakeHash(d),
    keys: {
      deriveSecp256k1: (mnemonic) => {
        const sk = h32("sk:" + mnemonic);
        const address = fakeHash(pubOf(sk).slice(1)).slice(-20);
        return { address, privateKey: sk };
      },
      serviceIdentity: (mnemonic, path) => {
        const pk = h32("pq:" + mnemonic + ":" + path);
        return { publicKey: pk, nodeId: "node-" + toHex(pk.slice(0, 4)).slice(2) };
      },
    },
    secp256k1: {
      getPublicKey: (sk, _compressed) => pubOf(sk),
      sign: (sk, digest) => {
        signed.set(toHex(digest), sk);
        const sig = new Uint8Array(65);
        sig[31] = 1; // r = 1
        sig[63] = 1; // s = 1
        sig[64] = opts.recid ?? 27;
        return sig;
      },
      recover: (digest, _sig) => {
        const sk = opts.tamper ? h32("tamper") : (signed.get(toHex(digest)) ?? h32("unknown"));
        return pubOf(sk);
      },
    },
  };
}

export interface FakeChainsOpts {
  chainId?: number;
  decimals?: number;
  symbol?: string;
  nonce?: number;
  balanceHex?: string;
  throwBalance?: boolean;
}

export interface FakeChains {
  provider: ChainProvider;
  /** The last raw tx handed to eth_sendRawTransaction. */
  sentRaw: () => string | undefined;
  /** Every JSON-RPC call the store issued, in order. */
  calls: () => Array<{ method: string; params?: unknown[] }>;
}

/** Fake hash returned by eth_sendRawTransaction. */
export const SENT_HASH = "0x" + "ab".repeat(32);

/** A ChainProvider + scripted EVM JSON-RPC client for the evm/store tests. */
export function fakeChains(opts: FakeChainsOpts = {}): FakeChains {
  const chainId = opts.chainId ?? 96369;
  const decimals = opts.decimals ?? 18;
  const symbol = opts.symbol ?? "ETH";
  const nonce = opts.nonce ?? 0;

  const chain: ChainEntry = {
    id: "fake-evm",
    name: "Fake EVM",
    family: "evm",
    evmChainId: chainId,
    networkId: chainId,
    mainnet: true,
    testnet: false,
    rpcRoute: String(chainId),
    bip44: { coinType: 60, path: "m/44'/60'/0'/0/0" },
    nativeAsset: { symbol, decimals },
    builderStatus: "ready",
  };

  let raw: string | undefined;
  const calls: Array<{ method: string; params?: unknown[] }> = [];

  const rpc: RpcClientLike = {
    async call<T>(req: { method: string; params?: unknown[] }): Promise<T> {
      calls.push(req);
      switch (req.method) {
        case "eth_getBalance":
          if (opts.throwBalance) throw new Error("rpc getBalance boom");
          return (opts.balanceHex ?? "0x0") as T;
        case "eth_estimateGas":
          return "0x5208" as T; // 21000
        case "eth_gasPrice":
          return "0x3b9aca00" as T; // 1 gwei
        case "eth_sendRawTransaction":
          raw = req.params?.[0] as string;
          return SENT_HASH as T;
        default:
          throw new Error("unexpected rpc method " + req.method);
      }
    },
    async getTransactionCount() {
      return nonce;
    },
  };

  return {
    provider: {
      chainById: (id) => (id === chainId || id === "fake-evm" ? chain : undefined),
      defaultChainId: () => chainId,
      rpcClient: () => rpc,
    },
    sentRaw: () => raw,
    calls: () => calls,
  };
}
