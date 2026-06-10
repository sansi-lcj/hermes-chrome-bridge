import { describe, expect, it } from 'vitest';
import { fileStem, toJson, toMarkdown } from './export';
import type { ConversationMeta, StoredMessage } from './conversation';

const meta: ConversationMeta = { id: 'c1', title: 'My chat', updatedAt: 0, system: 'Be terse.' };
const messages: StoredMessage[] = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: 'hi there' },
  { role: 'assistant', content: '' }, // empty trailing turn, skipped
];

describe('toMarkdown', () => {
  it('renders a titled, role-labelled transcript with the system prompt', () => {
    const md = toMarkdown(meta, messages);
    expect(md).toContain('# My chat');
    expect(md).toContain('**System:** Be terse.');
    expect(md).toContain('## You\n\nhello');
    expect(md).toContain('## Assistant\n\nhi there');
    expect(md).not.toMatch(/## Assistant\n\n\n/); // empty turn dropped
  });
});

describe('toJson', () => {
  it('embeds metadata and messages', () => {
    const parsed = JSON.parse(toJson(meta, messages));
    expect(parsed.meta.title).toBe('My chat');
    expect(parsed.messages).toHaveLength(3);
  });
});

describe('fileStem', () => {
  it('slugifies a title and caps length', () => {
    expect(fileStem('Hello, World!')).toBe('Hello-World');
    expect(fileStem('')).toBe('conversation');
    expect(fileStem(undefined)).toBe('conversation');
    expect(fileStem('x'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});
