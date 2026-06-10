import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { connectionOf, loadAccounts, newAccountId, saveAccounts } from '../lib/accounts';
import {
  DEFAULT_SETTINGS,
  type Account,
  type AccountsState,
  type ChatMode,
  type Settings,
} from '../lib/types';

interface SettingsState {
  accounts: Account[];
  activeId: string | null;
  loaded: boolean;
  // The active account's connection, mirrored flat for existing readers.
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  mode: ChatMode;

  apply: (state: AccountsState) => void;
  load: () => Promise<void>;
  addAccount: (a: Omit<Account, 'id'>) => Promise<string>;
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

function flat(state: AccountsState) {
  return { accounts: state.accounts, activeId: state.activeId, ...connectionOf(state) };
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    accounts: [],
    activeId: null,
    loaded: false,
    ...DEFAULT_SETTINGS,
    baseUrl: '',
    apiKey: '',

    apply: (state) => set(flat(state)),

    load: async () => {
      set({ ...flat(await loadAccounts()), loaded: true });
    },
    addAccount: async (a) => {
      const account: Account = { id: newAccountId(), ...a };
      set(
        flat(await saveAccounts({ accounts: [...get().accounts, account], activeId: account.id })),
      );
      return account.id;
    },
    updateAccount: async (id, patch) => {
      const accounts = get().accounts.map((acc) => (acc.id === id ? { ...acc, ...patch } : acc));
      set(flat(await saveAccounts({ accounts, activeId: get().activeId })));
    },
    removeAccount: async (id) => {
      const accounts = get().accounts.filter((acc) => acc.id !== id);
      const activeId = get().activeId === id ? (accounts[0]?.id ?? null) : get().activeId;
      set(flat(await saveAccounts({ accounts, activeId })));
    },
    setActive: async (id) => {
      set(flat(await saveAccounts({ accounts: get().accounts, activeId: id })));
    },
  })),
);

export function activeAccount(): Account | null {
  const { accounts, activeId } = useSettingsStore.getState();
  return accounts.find((a) => a.id === activeId) ?? null;
}

export function settingsValues(): Settings {
  const { baseUrl, apiKey, defaultModel, mode } = useSettingsStore.getState();
  return { baseUrl, apiKey, defaultModel, mode };
}

export function isConfigured(): boolean {
  const { baseUrl, apiKey } = useSettingsStore.getState();
  return Boolean(baseUrl && apiKey);
}
