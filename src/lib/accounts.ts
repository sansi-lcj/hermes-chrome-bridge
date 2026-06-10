// Multi-account persistence. Each account has its own base URL + API key +
// model, and one is "active". The background and HermesClient stay account-
// agnostic: they read the active account's connection via storage.getSettings().

import { DEFAULT_SETTINGS, type Account, type AccountsState, type Settings } from './types';

const KEY = 'accounts';
const LEGACY_SETTINGS_KEY = 'settings';
const LEGACY_CONVERSATION_KEY = 'conversation';

export function newAccountId(): string {
  return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyAccounts(): AccountsState {
  return { accounts: [], activeId: null };
}

/** The active account's connection, or an unconfigured (blank) Settings. */
export function connectionOf(state: AccountsState): Settings {
  const acc = state.accounts.find((a) => a.id === state.activeId);
  if (!acc) return { ...DEFAULT_SETTINGS, baseUrl: '', apiKey: '' };
  return {
    baseUrl: acc.baseUrl,
    apiKey: acc.apiKey,
    defaultModel: acc.defaultModel,
    mode: acc.mode,
  };
}

function normalize(state: AccountsState): AccountsState {
  const accounts = state.accounts.map((a) => ({ ...a, baseUrl: a.baseUrl.replace(/\/+$/, '') }));
  const activeId =
    state.activeId && accounts.some((a) => a.id === state.activeId)
      ? state.activeId
      : (accounts[0]?.id ?? null);
  return { accounts, activeId };
}

/**
 * Load the accounts state, migrating a pre-multi-account `settings` blob (and
 * its conversation) into a single "Default" account on first run.
 */
export async function loadAccounts(): Promise<AccountsState> {
  const res = await chrome.storage.local.get([KEY, LEGACY_SETTINGS_KEY, LEGACY_CONVERSATION_KEY]);
  const existing = res[KEY] as AccountsState | undefined;
  if (existing && Array.isArray(existing.accounts)) return normalize(existing);

  const legacy = res[LEGACY_SETTINGS_KEY] as Partial<Settings> | undefined;
  if (legacy && legacy.baseUrl) {
    const id = newAccountId();
    const account: Account = {
      id,
      name: 'Default',
      baseUrl: legacy.baseUrl,
      apiKey: legacy.apiKey ?? '',
      defaultModel: legacy.defaultModel ?? DEFAULT_SETTINGS.defaultModel,
      mode: legacy.mode ?? DEFAULT_SETTINGS.mode,
    };
    const state = normalize({ accounts: [account], activeId: id });
    await chrome.storage.local.set({ [KEY]: state });
    // Carry the legacy conversation over to the migrated account.
    const legacyConvo = res[LEGACY_CONVERSATION_KEY];
    if (Array.isArray(legacyConvo)) {
      await chrome.storage.local.set({ [`conv:${id}`]: legacyConvo });
    }
    return state;
  }
  return emptyAccounts();
}

export async function saveAccounts(state: AccountsState): Promise<AccountsState> {
  const next = normalize(state);
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onAccountsChanged(cb: (state: AccountsState) => void): () => void {
  const listener = (changes: { [name: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local' && changes[KEY]) {
      cb((changes[KEY].newValue as AccountsState) ?? emptyAccounts());
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
