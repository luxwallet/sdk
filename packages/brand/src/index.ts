/**
 * @luxwallet/brand — the ONE source of white-label truth.
 *
 * A brand is plain runtime config: identity, IAM endpoint, gateway host,
 * theme tokens, and the set of chains to enable. Any org white-labels the
 * Lux Wallet stack by shipping a `brand.json` (a K8s ConfigMap mount, or a
 * static file) — NEVER by forking a package.
 *
 * Runtime model (mirrors the canonical wallet brand.json pattern):
 *   1. A deployment ships /brand.json (its overrides over a base brand).
 *   2. The SPA / native host calls `loadBrandConfig()` before first render.
 *   3. Everything reads the `brand` singleton, which `loadBrandConfig`
 *      mutates IN PLACE so already-imported references see the live brand.
 *   4. Theme tokens are written to CSS custom properties on web; native
 *      reads `getBrand().theme` directly.
 *
 * Zero dependencies. MIT. This package does NOT import @luxfi/wallet-brand
 * (GPL) — it only mirrors that package's runtime brand.json mechanism.
 *
 * Secrets (IAM client secrets, WalletConnect ids, API keys) NEVER live in a
 * brand. They come from KMS, injected server-side. A brand is public config.
 */

/** IAM (HIP-0111) endpoint for the brand. `clientId` = `<org>-<app>`. */
export interface BrandIam {
  /** OIDC server, e.g. "https://iam.hanzo.ai" or "https://lux.id". */
  serverUrl: string;
  /** OAuth client id, `<org>-<app>`, e.g. "lux-wallet". */
  clientId: string;
  /** OIDC scopes, e.g. ["openid", "profile", "email"]. */
  scopes: string[];
}

/** Gateway the wallet reaches chains through. RPC = `<rpcBaseUrl>/v1/rpc/<chainId>`. */
export interface BrandGateway {
  /** Gateway base URL, e.g. "https://api.hanzo.ai". No trailing slash needed. */
  rpcBaseUrl: string;
}

/**
 * Brand theme tokens. Open record of token-name -> color so a brand can set
 * any subset of the wallet's design tokens (accent1, surface1, neutral1, …).
 * Applied as CSS custom properties on web (`--lw-<token>`).
 */
export type BrandTheme = Record<string, string>;

/** The canonical brand config. The full white-label contract. */
export interface BrandConfig {
  /** Stable brand id, e.g. "lux" | "hanzo" | "zoo" | "acme". */
  id: string;
  /** Display name, e.g. "Lux Wallet". */
  name: string;
  /** Short name for compact UI, e.g. "Lux". */
  shortName: string;
  /** Primary domain, e.g. "lux.network". */
  domain: string;
  /** IAM / OIDC config. */
  iam: BrandIam;
  /** Gateway config. */
  gateway: BrandGateway;
  /** Theme tokens applied at runtime. */
  theme: BrandTheme;
  /** Chain ids (from @luxwallet/chains) to enable for this brand. */
  chains: string[];
  /** Optional logo URL. */
  logo?: string;
}

/** CSS custom-property name for a brand theme token, e.g. `accent1` -> `--lw-accent1`. */
export function brandCssVarName(token: string): string {
  return `--lw-${token}`;
}

/**
 * Validate and return a brand config. Throws on the mistakes that silently
 * break a deployment (empty id/name, malformed IAM serverUrl, gateway URL
 * with no scheme, empty chain set). Validation is at the boundary only —
 * once a BrandConfig exists, downstream code trusts it.
 */
export function defineBrand(cfg: BrandConfig): BrandConfig {
  const req = (v: unknown, field: string): string => {
    if (typeof v !== "string" || v.length === 0) {
      throw new Error(`@luxwallet/brand: ${field} is required and must be a non-empty string`);
    }
    return v;
  };
  const url = (v: unknown, field: string): string => {
    const s = req(v, field);
    if (!/^https?:\/\//.test(s)) {
      throw new Error(`@luxwallet/brand: ${field} must be an absolute http(s) URL, got ${JSON.stringify(s)}`);
    }
    return s;
  };

  req(cfg.id, "id");
  req(cfg.name, "name");
  req(cfg.shortName, "shortName");
  req(cfg.domain, "domain");

  if (!cfg.iam || typeof cfg.iam !== "object") {
    throw new Error("@luxwallet/brand: iam is required");
  }
  url(cfg.iam.serverUrl, "iam.serverUrl");
  req(cfg.iam.clientId, "iam.clientId");
  if (!Array.isArray(cfg.iam.scopes) || cfg.iam.scopes.length === 0) {
    throw new Error("@luxwallet/brand: iam.scopes must be a non-empty string[]");
  }

  if (!cfg.gateway || typeof cfg.gateway !== "object") {
    throw new Error("@luxwallet/brand: gateway is required");
  }
  url(cfg.gateway.rpcBaseUrl, "gateway.rpcBaseUrl");

  if (!cfg.theme || typeof cfg.theme !== "object") {
    throw new Error("@luxwallet/brand: theme is required (may be an empty object)");
  }
  if (!Array.isArray(cfg.chains) || cfg.chains.length === 0) {
    throw new Error("@luxwallet/brand: chains must be a non-empty string[] of chain ids");
  }

  return cfg;
}

/** Default Lux brand. */
export const LUX_BRAND: BrandConfig = defineBrand({
  id: "lux",
  name: "Lux Wallet",
  shortName: "Lux",
  domain: "lux.network",
  iam: {
    serverUrl: "https://lux.id",
    clientId: "lux-wallet",
    scopes: ["openid", "profile", "email"],
  },
  gateway: {
    rpcBaseUrl: "https://api.lux.network",
  },
  theme: {
    accent1: "#FFFFFF",
    surface1: "#000000",
    neutral1: "#FFFFFF",
  },
  chains: ["lux-c-mainnet", "lux-x-mainnet", "lux-p-mainnet"],
});

/** Example Hanzo brand. */
export const HANZO_BRAND: BrandConfig = defineBrand({
  id: "hanzo",
  name: "Hanzo Wallet",
  shortName: "Hanzo",
  domain: "hanzo.ai",
  iam: {
    serverUrl: "https://iam.hanzo.ai",
    clientId: "hanzo-wallet",
    scopes: ["openid", "profile", "email"],
  },
  gateway: {
    rpcBaseUrl: "https://api.hanzo.ai",
  },
  theme: {
    accent1: "#FFFFFF",
    surface1: "#000000",
    neutral1: "#FFFFFF",
  },
  chains: ["hanzo-mainnet"],
});

/**
 * The live brand singleton. Defaults to Lux so chain-dependent code is
 * correct BEFORE `loadBrandConfig()` resolves. `loadBrandConfig` mutates
 * this object in place; never reassign it (callers hold the reference).
 */
export const brand: BrandConfig = { ...LUX_BRAND };

/** Return the live brand. */
export function getBrand(): BrandConfig {
  return brand;
}

/** Write theme tokens to CSS custom properties on `:root`. Web only; no-op on native. */
function applyBrandThemeVars(theme: BrandTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [token, value] of Object.entries(theme)) {
    if (value) root.style.setProperty(brandCssVarName(token), value);
  }
}

/**
 * Load brand config from a URL (default `/brand.json`) and merge it over the
 * current brand IN PLACE. Mirrors the canonical wallet `loadBrandConfig`:
 * fetch the deployment's brand.json, `Object.assign` it onto the singleton,
 * apply theme tokens to CSS vars, and update the document title. On any fetch
 * failure it FAILS SAFE — keeps the current (default) brand so local dev and
 * offline boots still work.
 *
 * Returns the live brand either way.
 */
export async function loadBrandConfig(url = "/brand.json"): Promise<BrandConfig> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = (await res.json()) as Partial<BrandConfig>;

    // Merge top-level fields, deep-merging the nested objects so a brand.json
    // that sets only `iam.serverUrl` does not wipe the rest of the brand.
    const { iam, gateway, theme, ...rest } = next;
    Object.assign(brand, rest);
    if (iam) Object.assign(brand.iam, iam);
    if (gateway) Object.assign(brand.gateway, gateway);
    if (theme) brand.theme = { ...brand.theme, ...theme };

    applyBrandThemeVars(brand.theme);
    if (typeof document !== "undefined" && brand.name) {
      document.title = brand.name;
    }
    return brand;
  } catch {
    // Fail safe: keep the current brand (default Lux) for local/offline boots.
    return brand;
  }
}
