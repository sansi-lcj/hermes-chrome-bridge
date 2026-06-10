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
      remove: vi.fn(async (key: string) => {
        delete store[key];
      }),
    },
  },
});

const {
  MAX_STORED_MESSAGES,
  MAX_TITLE_CHARS,
  emptyIndex,
  loadIndex,
  loadMessages,
  removeMessages,
  saveIndex,
  saveMessages,
  searchConversations,
  snippetAround,
  titleFrom,
  trimConversation,
} = await import('./conversation');
import type { StoredMessage } from './conversation';

const msg = (content: string, role: StoredMessage['role'] = 'user'): StoredMessage => ({
  role,
  content,
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('trimConversation', () => {
  it('drops an empty trailing assistant turn', () => {
    const out = trimConversation([msg('hi'), msg('', 'assistant')]);
    expect(out).toEqual([msg('hi')]);
  });

  it('keeps a non-empty trailing assistant turn', () => {
    const out = trimConversation([msg('hi'), msg('there', 'assistant')]);
    expect(out).toHaveLength(2);
  });

  it('caps to the most recent MAX_STORED_MESSAGES', () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 50 }, (_, i) => msg(`m${i}`));
    const out = trimConversation(many);
    expect(out).toHaveLength(MAX_STORED_MESSAGES);
    expect(out[out.length - 1].content).toBe(`m${MAX_STORED_MESSAGES + 49}`);
  });
});

describe('titleFrom', () => {
  it('uses the first line, length-capped', () => {
    expect(titleFrom('Hello world\nsecond line')).toBe('Hello world');
    const long = 'x'.repeat(MAX_TITLE_CHARS + 10);
    expect(titleFrom(long)).toHaveLength(MAX_TITLE_CHARS + 1); // + ellipsis
    expect(titleFrom(long).endsWith('…')).toBe(true);
  });
});

describe('conversation index', () => {
  it('starts empty (and a null account is always empty)', async () => {
    expect(await loadIndex('acc-1')).toEqual(emptyIndex());
    expect(await loadIndex(null)).toEqual(emptyIndex());
  });

  it('round-trips an index and per-conversation messages', async () => {
    const index = {
      conversations: [{ id: 'c-1', title: 'First', updatedAt: 1 }],
      activeId: 'c-1',
    };
    await saveIndex('acc-1', index);
    await saveMessages('acc-1', 'c-1', [msg('hi'), msg('there', 'assistant')]);

    expect(await loadIndex('acc-1')).toEqual(index);
    expect(await loadMessages('acc-1', 'c-1')).toHaveLength(2);
    // Conversations are isolated per id and per account.
    expect(await loadMessages('acc-1', 'c-2')).toEqual([]);
    expect(await loadMessages('acc-2', 'c-1')).toEqual([]);

    await removeMessages('acc-1', 'c-1');
    expect(await loadMessages('acc-1', 'c-1')).toEqual([]);
  });

  it('migrates a 1.8.x single conversation into a one-entry list', async () => {
    store['conv:acc-1'] = [msg('What is Hermes?'), msg('An agent.', 'assistant')];

    const index = await loadIndex('acc-1');
    expect(index.conversations).toHaveLength(1);
    expect(index.conversations[0].title).toBe('What is Hermes?');
    expect(index.activeId).toBe(index.conversations[0].id);
    // Messages carried over under the new key; legacy blob removed.
    expect(await loadMessages('acc-1', index.activeId)).toHaveLength(2);
    expect(store['conv:acc-1']).toBeUndefined();
    // The migrated index is persisted (second load shows the same id).
    expect((await loadIndex('acc-1')).activeId).toBe(index.activeId);
  });
});

describe('snippetAround', () => {
  it('frames the first match with ellipses', () => {
    const filler = 'word '.repeat(20); // 100 chars, pushes the match past the radius
    const text = `${filler}TARGET ${filler}`;
    const snip = snippetAround(text, 'TARGET');
    expect(snip).toContain('TARGET');
    expect(snip.startsWith('…')).toBe(true);
    expect(snip.endsWith('…')).toBe(true);
    expect(snip.length).toBeLessThan(text.length);
  });
});

describe('searchConversations', () => {
  it('matches titles and message content, with snippets', async () => {
    const index = {
      conversations: [
        { id: 'c1', title: 'Rust ownership', updatedAt: 2 },
        { id: 'c2', title: 'Cooking pasta', updatedAt: 1 },
      ],
      activeId: 'c1',
    };
    await saveIndex('acc-1', index);
    await saveMessages('acc-1', 'c1', [msg('explain the borrow checker')]);
    await saveMessages('acc-1', 'c2', [msg('how long to boil spaghetti')]);

    // Title match.
    expect((await searchConversations('acc-1', index, 'rust')).map((h) => h.id)).toEqual(['c1']);
    // Content match returns a snippet, not the title.
    const hits = await searchConversations('acc-1', index, 'borrow');
    expect(hits.map((h) => h.id)).toEqual(['c1']);
    expect(hits[0].snippet).toContain('borrow');
    // No match.
    expect(await searchConversations('acc-1', index, 'zzz')).toEqual([]);
    // Empty query / null account short-circuit.
    expect(await searchConversations('acc-1', index, '  ')).toEqual([]);
    expect(await searchConversations(null, index, 'rust')).toEqual([]);
  });
});
