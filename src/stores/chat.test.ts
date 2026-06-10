import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture what the store posts over the (faked) Port, and let tests trigger a
// disconnect (simulating an MV3 worker recycle).
const sent: Array<Record<string, unknown>> = [];
const disconnectCbs: Array<() => void> = [];
const triggerDisconnect = () => disconnectCbs.forEach((cb) => cb());
const fakePort = {
  onMessage: { addListener: vi.fn() },
  onDisconnect: { addListener: (cb: () => void) => disconnectCbs.push(cb) },
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
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

const { useChatStore, onPortMessage } = await import('./chat');

const startId = () => (sent.find((m) => m.type === 'chat.start')?.requestId as string) ?? '';

describe('chat store', () => {
  beforeEach(() => {
    sent.length = 0;
    useChatStore.setState({
      messages: [],
      input: '',
      streaming: false,
      models: [],
      attachContext: false,
      onDevice: false,
      onDeviceSupported: false,
      mode: 'chat',
      model: 'hermes',
    });
  });

  it('creates a user + assistant turn and starts streaming', () => {
    useChatStore.getState().sendMessage('hello');
    const s = useChatStore.getState();
    expect(s.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(s.messages[0].content).toBe('hello');
    expect(s.streaming).toBe(true);
    expect(sent.some((m) => m.type === 'chat.start')).toBe(true);
  });

  it('applies streamed deltas in order and completes', () => {
    useChatStore.getState().sendMessage('hi');
    const id = startId();
    onPortMessage({ type: 'chat.delta', requestId: id, content: 'wor' });
    onPortMessage({ type: 'chat.delta', requestId: id, content: 'ld' });
    expect(useChatStore.getState().messages[1].content).toBe('world');
    onPortMessage({ type: 'chat.done', requestId: id });
    expect(useChatStore.getState().streaming).toBe(false);
  });

  it('ignores deltas for a stale request id', () => {
    useChatStore.getState().sendMessage('hi');
    onPortMessage({ type: 'chat.delta', requestId: 'stale', content: 'X' });
    expect(useChatStore.getState().messages[1].content).toBe('');
  });

  it('does not send while already streaming', () => {
    useChatStore.getState().sendMessage('first');
    useChatStore.getState().sendMessage('second');
    expect(sent.filter((m) => m.type === 'chat.start')).toHaveLength(1);
  });

  it('newChat clears the conversation and stops streaming', () => {
    useChatStore.getState().sendMessage('hi');
    useChatStore.getState().newChat();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().streaming).toBe(false);
  });

  it('clears streaming and flags the interruption when the port drops mid-stream', () => {
    useChatStore.getState().sendMessage('hi');
    expect(useChatStore.getState().streaming).toBe(true);
    triggerDisconnect(); // MV3 worker recycled — no chat.done will arrive
    const s = useChatStore.getState();
    expect(s.streaming).toBe(false);
    expect(s.messages[s.messages.length - 1].content).toMatch(/Connection lost/);
  });

  it('surfaces a tool confirmation and reports the decision', () => {
    useChatStore.getState().sendMessage('do something');
    const id = startId();
    onPortMessage({
      type: 'confirm',
      requestId: id,
      confirmId: 'c1',
      tool: 'open_url',
      args: '{}',
    });
    expect(useChatStore.getState().pendingConfirm).toEqual({
      confirmId: 'c1',
      tool: 'open_url',
      args: '{}',
    });
    useChatStore.getState().resolveConfirm(true);
    expect(useChatStore.getState().pendingConfirm).toBeNull();
    expect(
      sent.some((m) => m.type === 'confirm.result' && m.confirmId === 'c1' && m.approved === true),
    ).toBe(true);
  });
});
