import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsStore } from './SettingsStore';

// Capture what the store posts over the (faked) Port.
const sent: Array<Record<string, unknown>> = [];
const fakePort = {
  onMessage: { addListener: vi.fn() },
  onDisconnect: { addListener: vi.fn() },
  postMessage: (m: Record<string, unknown>) => sent.push(m),
};

vi.stubGlobal('chrome', {
  runtime: {
    connect: vi.fn(() => fakePort),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    sendMessage: vi.fn(async () => ({ ok: true, data: [] })),
  },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
  },
});

const { ChatStore } = await import('./ChatStore');

const stubSettings = { baseUrl: '', apiKey: '', defaultModel: 'm', mode: 'chat' } as SettingsStore;
const newStore = () => new ChatStore(stubSettings);
const startId = () => (sent.find((m) => m.type === 'chat.start')?.requestId as string) ?? '';

describe('ChatStore', () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it('creates a user + assistant turn and starts streaming', () => {
    const s = newStore();
    s.sendMessage('hello');
    expect(s.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(s.messages[0].content).toBe('hello');
    expect(s.streaming).toBe(true);
    expect(sent.some((m) => m.type === 'chat.start')).toBe(true);
  });

  it('applies streamed deltas in order and completes', () => {
    const s = newStore();
    s.sendMessage('hi');
    const id = startId();
    s.onPortMessage({ type: 'chat.delta', requestId: id, content: 'wor' });
    s.onPortMessage({ type: 'chat.delta', requestId: id, content: 'ld' });
    expect(s.messages[1].content).toBe('world');
    s.onPortMessage({ type: 'chat.done', requestId: id });
    expect(s.streaming).toBe(false);
  });

  it('ignores deltas for a stale request id', () => {
    const s = newStore();
    s.sendMessage('hi');
    s.onPortMessage({ type: 'chat.delta', requestId: 'stale', content: 'X' });
    expect(s.messages[1].content).toBe('');
  });

  it('does not send while already streaming', () => {
    const s = newStore();
    s.sendMessage('first');
    s.sendMessage('second');
    expect(sent.filter((m) => m.type === 'chat.start')).toHaveLength(1);
  });

  it('newChat clears the conversation and stops streaming', () => {
    const s = newStore();
    s.sendMessage('hi');
    s.newChat();
    expect(s.messages).toEqual([]);
    expect(s.streaming).toBe(false);
  });
});
