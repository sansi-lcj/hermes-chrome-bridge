import { describe, expect, it } from 'vitest';
import { MAX_STORED_MESSAGES, trimConversation } from './conversation';
import type { StoredMessage } from './conversation';

const msg = (content: string, role: StoredMessage['role'] = 'user'): StoredMessage => ({
  role,
  content,
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
