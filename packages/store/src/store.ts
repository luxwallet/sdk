/**
 * The Lux Wallet store — the ONE headless wallet store for Hanzo/Lux/Zoo.
 *
 * Self-contained and node-independent: create / import / reveal / balance /
 * send all run locally against the injected crypto engine and the brand RPC
 * gateway. Headless and brand-neutral — the chain list, gateway, keychain, and
 * crypto loader are all INJECTED via {@link WalletEngineConfig}, so the same
 * store backs every consumer. Derivation (account.ts) and EVM ops (evm.ts) are
 * pure; this file is only the zustand composition and store bookkeeping.
 */
import { ethers } from "ethers";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { accountFromMnemonic, accountFromPrivateKey } from "./account.js";
import { getBalance, signAndSendEvm } from "./evm.js";
import type {
  Balance,
  LuxAccount,
  SendParams,
  Status,
  WalletEngineConfig,
  WalletType,
} from "./types.js";

export interface LuxWalletState {
  accounts: LuxAccount[];
  selectedAccountId: string | null;
  selectedChainId: number;
  status: Status;
  error: string | null;

  init: () => Promise<void>;
  createWallet: (opts?: {
    label?: string;
    type?: WalletType;
  }) => Promise<{ account: LuxAccount; mnemonic: string }>;
  importMnemonic: (
    mnemonic: string,
    opts?: { label?: string; type?: WalletType },
  ) => Promise<LuxAccount>;
  importPrivateKey: (
    privateKey: string,
    opts?: { label?: string },
  ) => Promise<LuxAccount>;
  removeWallet: (id: string) => Promise<void>;
  revealMnemonic: (id: string) => Promise<string | null>;
  selectAccount: (id: string) => void;
  selectChain: (chainId: number) => void;
  getBalance: (chainId: number, address: string) => Promise<Balance>;
  sendEvm: (params: SendParams) => Promise<{ hash: string }>;
}

/**
 * Build the headless wallet store for a brand. Everything brand-specific is in
 * `config`; the store logic is identical across every consumer.
 */
export function createLuxWallet(config: WalletEngineConfig) {
  const { crypto: getEngine, keychain, chains } = config;

  return create<LuxWalletState>()(
    persist(
      (set, get) => {
        /** Store bookkeeping: id/label/type/clock. Impurity isolated here. */
        const meta = (opts?: { label?: string; type?: WalletType }) => ({
          id: globalThis.crypto.randomUUID(),
          label: opts?.label ?? `Wallet ${get().accounts.length + 1}`,
          type: opts?.type ?? ("local-hd-pq" as WalletType),
          createdAt: Date.now(),
        });

        /** Append the account, select it, mark ready. */
        const insert = (account: LuxAccount) =>
          set((s) => ({
            accounts: [...s.accounts, account],
            selectedAccountId: account.id,
            status: "ready" as Status,
          }));

        return {
          accounts: [],
          selectedAccountId: null,
          selectedChainId: chains.defaultChainId(),
          status: "idle",
          error: null,

          init: async () => {
            if (get().status === "ready" || get().status === "loading") return;
            set({ status: "loading", error: null });
            try {
              await getEngine();
              set({ status: "ready" });
            } catch (e) {
              set({
                status: "error",
                error: e instanceof Error ? e.message : String(e),
              });
            }
          },

          createWallet: async (opts) => {
            const engine = await getEngine();
            const phrase = ethers.Wallet.createRandom().mnemonic?.phrase ?? "";
            if (!phrase) throw new Error("failed to generate recovery phrase");
            const { account, secrets } = accountFromMnemonic(engine, phrase, meta(opts));
            await keychain.seal(account.id, secrets);
            insert(account);
            return { account, mnemonic: secrets.mnemonic ?? phrase };
          },

          importMnemonic: async (mnemonic, opts) => {
            const engine = await getEngine();
            const { account, secrets } = accountFromMnemonic(engine, mnemonic, meta(opts));
            await keychain.seal(account.id, secrets);
            insert(account);
            return account;
          },

          importPrivateKey: async (privateKey, opts) => {
            const engine = await getEngine();
            const { account, secrets } = accountFromPrivateKey(engine, privateKey, meta(opts));
            await keychain.seal(account.id, secrets);
            insert(account);
            return account;
          },

          removeWallet: async (id) => {
            await keychain.drop(id);
            set((s) => {
              const accounts = s.accounts.filter((a) => a.id !== id);
              return {
                accounts,
                selectedAccountId:
                  s.selectedAccountId === id
                    ? (accounts[0]?.id ?? null)
                    : s.selectedAccountId,
              };
            });
          },

          revealMnemonic: (id) => keychain.getMnemonic(id),

          selectAccount: (id) => set({ selectedAccountId: id }),
          selectChain: (chainId) => set({ selectedChainId: chainId }),

          getBalance: (chainId, address) => getBalance(chains, chainId, address),

          sendEvm: async ({ accountId, chainId, to, amountEther, data }) => {
            const engine = await getEngine();
            const account = get().accounts.find((a) => a.id === accountId);
            if (!account) throw new Error("unknown account");
            const pkHex = await keychain.getPrivateKey(accountId);
            if (!pkHex) throw new Error("no signing key available for this wallet");
            return signAndSendEvm(engine, chains, {
              from: account.evmAddress,
              pkHex,
              chainId,
              to,
              amountEther,
              data,
            });
          },
        };
      },
      {
        name: config.persistName ?? "lux-wallet",
        // Secrets live in the keychain seam, NEVER in persisted state. Only
        // public account metadata + selection is stored.
        partialize: (s) => ({
          accounts: s.accounts,
          selectedAccountId: s.selectedAccountId,
          selectedChainId: s.selectedChainId,
        }),
      },
    ),
  );
}

/** The bound store type `createLuxWallet` returns. */
export type LuxWalletStore = ReturnType<typeof createLuxWallet>;
