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
      conversations: [],
      conversationId: null,
      system: '',
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

  it('does not double-send while the page-context fetch is in flight', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: { url: 'https://x', title: 'T', selection: '', text: 'body' },
    });
    useChatStore.setState({ attachContext: true });
    // Both submits land before the async context fetch resolves.
    useChatStore.getState().sendMessage('first');
    useChatStore.getState().sendMessage('first again');
    await vi.waitFor(() => {
      expect(sent.filter((m) => m.type === 'chat.start')).toHaveLength(1);
    });
  });

  it('keeps Run mode and Agent tools mutually exclusive', () => {
    useChatStore.getState().setMode('run');
    useChatStore.getState().setAgentTools(true);
    expect(useChatStore.getState().mode).toBe('chat'); // tools switched run off
    useChatStore.getState().setMode('run');
    expect(useChatStore.getState().agentTools).toBe(false); // run switched tools off
  });

  it('newChat starts a fresh draft and stops streaming (old chat is kept)', () => {
    useChatStore.getState().sendMessage('hi');
    const firstConv = useChatStore.getState().conversationId;
    useChatStore.getState().newChat();
    const s = useChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.streaming).toBe(false);
    expect(s.conversationId).toBeNull(); // draft until the next message
    expect(s.conversations.map((c) => c.id)).toContain(firstConv); // not deleted
  });

  it('materializes a conversation on the first message, titled from it', () => {
    useChatStore.getState().sendMessage('What is the Hermes Agent?\nmore detail');
    const s = useChatStore.getState();
    expect(s.conversationId).not.toBeNull();
    expect(s.conversations).toHaveLength(1);
    expect(s.conversations[0].title).toBe('What is the Hermes Agent?');
  });

  it('regenerate re-asks the last user message, replacing the answer', () => {
    useChatStore.getState().sendMessage('question');
    const id = startId();
    onPortMessage({ type: 'chat.delta', requestId: id, content: 'bad answer' });
    onPortMessage({ type: 'chat.done', requestId: id });

    useChatStore.getState().regenerate();
    const s = useChatStore.getState();
    expect(s.streaming).toBe(true);
    expect(s.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(s.messages[1].content).toBe(''); // old answer replaced by a fresh turn
    expect(sent.filter((m) => m.type === 'chat.start')).toHaveLength(2);
  });

  it('deleteMessage removes a single message', () => {
    useChatStore.getState().sendMessage('one');
    const id = startId();
    onPortMessage({ type: 'chat.delta', requestId: id, content: 'answer' });
    onPortMessage({ type: 'chat.done', requestId: id });

    useChatStore.getState().deleteMessage(1);
    expect(useChatStore.getState().messages.map((m) => m.content)).toEqual(['one']);
  });

  it('sends the system prompt ahead of the history', () => {
    useChatStore.getState().setSystem('Be terse.');
    useChatStore.getState().sendMessage('hi');
    const start = sent.find((m) => m.type === 'chat.start') as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(start.messages[0]).toEqual({ role: 'system', content: 'Be terse.' });
    expect(start.messages[1]).toEqual({ role: 'user', content: 'hi' });
    // The system prompt is stored on the conversation meta, not in the history.
    expect(useChatStore.getState().messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(useChatStore.getState().conversations[0].system).toBe('Be terse.');
  });

  it('rename and delete update the conversation list', async () => {
    useChatStore.getState().sendMessage('first');
    const convId = useChatStore.getState().conversationId!;
    useChatStore.getState().renameConversation(convId, 'My chat');
    expect(useChatStore.getState().conversations[0].title).toBe('My chat');

    await useChatStore.getState().deleteConversation(convId);
    const s = useChatStore.getState();
    expect(s.conversations).toHaveLength(0);
    expect(s.conversationId).toBeNull();
    expect(s.messages).toEqual([]);
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
