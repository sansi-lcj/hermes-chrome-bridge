import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of arr) if (k in store) out[k] = store[k];
        return out;
      }),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

const { loadAccounts, saveAccounts, connectionOf, emptyAccounts } = await import('./accounts');

const reset = () => {
  for (const k of Object.keys(store)) delete store[k];
};

describe('accounts', () => {
  beforeEach(reset);

  it('starts empty with no active connection', async () => {
    const state = await loadAccounts();
    expect(state).toEqual(emptyAccounts());
    expect(connectionOf(state).baseUrl).toBe('');
  });

  it('migrates a legacy settings blob (and its conversation) into a Default account', async () => {
    store.settings = {
      baseUrl: 'http://127.0.0.1:8642/',
      apiKey: 'k',
      defaultModel: 'hermes',
      mode: 'chat',
    };
    store.conversation = [{ role: 'user', content: 'hi' }];

    const state = await loadAccounts();
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0].name).toBe('Default');
    expect(state.accounts[0].baseUrl).toBe('http://127.0.0.1:8642'); // trailing slash stripped
    expect(state.activeId).toBe(state.accounts[0].id);
    // conversation carried over to conv:<id>
    expect(store[`conv:${state.accounts[0].id}`]).toEqual([{ role: 'user', content: 'hi' }]);
    // connection reflects the active account
    expect(connectionOf(state).apiKey).toBe('k');
  });

  it('persists accounts and resolves a dangling activeId', async () => {
    const a = {
      id: 'a1',
      name: 'A',
      baseUrl: 'http://h1',
      apiKey: 'k1',
      defaultModel: 'm',
      mode: 'chat' as const,
    };
    const b = {
      id: 'b2',
      name: 'B',
      baseUrl: 'http://h2',
      apiKey: 'k2',
      defaultModel: 'm',
      mode: 'chat' as const,
    };
    await saveAccounts({ accounts: [a, b], activeId: 'gone' });
    const state = await loadAccounts();
    expect(state.accounts.map((x) => x.id)).toEqual(['a1', 'b2']);
    expect(state.activeId).toBe('a1'); // dangling activeId → first account
    expect(connectionOf(state).baseUrl).toBe('http://h1');
    expect(connectionOf({ ...state, activeId: 'b2' }).apiKey).toBe('k2');
  });
});
