/**
 * @luxwallet/rpc — gateway RPC client.
 *
 * ONE way to reach a chain: through the brand gateway at
 *
 *   https://<gateway>/v1/rpc/<route>
 *
 * Default gateway is `api.hanzo.ai`. White-label brands override the host
 * (lux → api.lux.network, etc.) and may pin a per-chain RPC override.
 * Mirrors `getBootnodeRpcUrl` from lux/wallet apps/web wagmi config:
 *  - per-chain override wins;
 *  - else `https://<gateway>/v1/rpc/<route>`;
 *  - never return an empty string (an empty URL silently coerces to the
 *    page origin in the browser, which is always wrong).
 *
 * No `/api/` prefix (one-and-only-one-way: api.* host + /v1/). No /v2.
 */
import { getChain } from "@luxwallet/chains";

/** Default brand gateway host. */
export const DEFAULT_GATEWAY = "api.hanzo.ai";

export interface RpcConfig {
  /**
   * Gateway host WITHOUT scheme, e.g. "api.hanzo.ai" or
   * "api.lux.network". The scheme is always https.
   */
  gateway?: string;
  /**
   * Per-chain RPC URL overrides, keyed by EIP-155 chain id OR registry
   * id. A present, non-empty value wins over the gateway URL. Use this
   * for private/white-label endpoints.
   */
  overrides?: Record<string | number, string>;
}

/** Normalize a gateway host: strip scheme and any trailing slash. */
function normalizeGateway(gateway: string): string {
  return gateway.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Resolve the RPC URL for a chain. Accepts a registry id ("lux-c-mainnet")
 * or an EIP-155 chain id (96369). Throws if the chain is unknown or has no
 * `rpcRoute` (non-routable). Never returns an empty string.
 */
export function getRpcUrl(chain: string | number, config: RpcConfig = {}): string {
  const entry = getChain(chain);
  if (!entry) {
    throw new Error(`@luxwallet/rpc: unknown chain ${JSON.stringify(chain)}`);
  }

  const override =
    config.overrides?.[entry.id] ??
    (entry.evmChainId !== undefined ? config.overrides?.[entry.evmChainId] : undefined);
  if (override && override.length > 0) {
    return override;
  }

  const gateway = normalizeGateway(config.gateway ?? DEFAULT_GATEWAY);
  return `https://${gateway}/v1/rpc/${entry.rpcRoute}`;
}

/** Minimal JSON-RPC request shape. */
export interface JsonRpcRequest {
  method: string;
  params?: unknown[];
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * A thin EVM JSON-RPC client bound to a resolved gateway URL. Real and
 * minimal: it POSTs JSON-RPC 2.0 and surfaces RPC errors as thrown
 * Errors. Non-EVM families route through their own (todo) builders in
 * `@luxwallet/tx`; this client is the EVM transport.
 */
export class RpcClient {
  readonly url: string;
  #id = 0;

  constructor(chain: string | number, config: RpcConfig = {}) {
    this.url = getRpcUrl(chain, config);
  }

  /** Issue a single JSON-RPC call. Throws on transport or RPC error. */
  async call<T = unknown>(req: JsonRpcRequest, init?: { signal?: AbortSignal }): Promise<T> {
    const body = {
      jsonrpc: "2.0" as const,
      id: ++this.#id,
      method: req.method,
      params: req.params ?? [],
    };
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: init?.signal,
    });
    if (!res.ok) {
      throw new Error(`@luxwallet/rpc: ${req.method} -> HTTP ${res.status}`);
    }
    const json = (await res.json()) as JsonRpcResponse<T>;
    if (json.error) {
      throw new Error(`@luxwallet/rpc: ${req.method} -> ${json.error.code} ${json.error.message}`);
    }
    return json.result as T;
  }

  /** eth_chainId as a number. */
  async chainId(): Promise<number> {
    const hex = await this.call<string>({ method: "eth_chainId" });
    return Number.parseInt(hex, 16);
  }

  /** eth_getTransactionCount(address, "pending") — the next nonce. */
  async getTransactionCount(address: string): Promise<number> {
    const hex = await this.call<string>({
      method: "eth_getTransactionCount",
      params: [address, "pending"],
    });
    return Number.parseInt(hex, 16);
  }
}
