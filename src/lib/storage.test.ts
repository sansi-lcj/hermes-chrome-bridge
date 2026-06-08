import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './types';

// Minimal in-memory chrome.storage.local mock installed before importing storage.
const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

const { getSettings, setSettings } = await import('./storage');

describe('storage', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a partial patch over defaults', async () => {
    await setSettings({ apiKey: 'secret' });
    const s = await getSettings();
    expect(s.apiKey).toBe('secret');
    expect(s.defaultModel).toBe(DEFAULT_SETTINGS.defaultModel);
  });

  it('strips trailing slashes from baseUrl', async () => {
    const s = await setSettings({ baseUrl: 'http://localhost:8642///' });
    expect(s.baseUrl).toBe('http://localhost:8642');
  });
});
