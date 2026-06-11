import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
    },
  },
});

const { makeId, loadCollection, saveCollection } = await import('./collection');

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('makeId', () => {
  it('prefixes a uuid with the given type tag', () => {
    const id = makeId('sp');
    expect(id.startsWith('sp-')).toBe(true);
    expect(makeId('sp')).not.toBe(id); // unique
  });
});

describe('loadCollection / saveCollection', () => {
  it('returns [] for a missing or non-array value', async () => {
    expect(await loadCollection('k')).toEqual([]);
    store.k = { not: 'an array' };
    expect(await loadCollection('k')).toEqual([]);
  });

  it('round-trips an array under its key', async () => {
    await saveCollection('k', [{ id: 'a' }, { id: 'b' }]);
    expect(await loadCollection<{ id: string }>('k')).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});
