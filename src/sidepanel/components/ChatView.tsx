import { useEffect, useMemo, useRef, useState } from 'react';
import type { BackgroundToUi, ChatMode, ModelInfo, PageContext, Settings } from '../../lib/types';
import {
  clearConversation,
  loadConversation,
  saveConversation,
  type StoredMessage,
} from '../../lib/conversation';
import { sendRuntime, usePort } from '../hooks/usePort';
import { Markdown } from './Markdown';

let counter = 0;
const nextId = () => `req-${Date.now()}-${counter++}`;

export function ChatView({ settings }: { settings: Settings }) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>(settings.mode);
  const [model, setModel] = useState(settings.defaultModel);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [attachContext, setAttachContext] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks the in-flight assistant turn so streamed deltas land in the right slot.
  const activeReq = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { send } = usePort((msg: BackgroundToUi) => {
    if (msg.requestId !== activeReq.current) return;
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      if (msg.type === 'chat.delta') last.content += msg.content;
      else if (msg.type === 'chat.tool') {
        last.tools = [...(last.tools ?? []), formatTool(msg.progress)];
      } else if (msg.type === 'error') {
        setError(msg.message);
      }
      return next;
    });
    if (msg.type === 'chat.done' || msg.type === 'error') {
      setStreaming(false);
      activeReq.current = null;
    }
  });

  // Restore persisted conversation once on mount.
  useEffect(() => {
    loadConversation().then(setMessages);
  }, []);

  useEffect(() => {
    setModel(settings.defaultModel);
    setMode(settings.mode);
  }, [settings.defaultModel, settings.mode]);

  useEffect(() => {
    sendRuntime<ModelInfo[]>({ type: 'api', action: 'models' })
      .then(setModels)
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  // Persist whenever a turn completes (avoid churning storage mid-stream).
  useEffect(() => {
    if (!streaming && messages.length > 0) void saveConversation(messages);
  }, [streaming, messages]);

  const canSend = input.trim().length > 0 && !streaming;

  async function handleSend() {
    if (!canSend) return;
    setError(null);

    let userContent = input.trim();
    if (attachContext) {
      try {
        const ctx = await sendRuntime<PageContext>({ type: 'getActivePageContext' });
        userContent += `\n\n${formatContext(ctx)}`;
      } catch (err) {
        setError(`Could not attach page context: ${String(err)}`);
      }
    }

    const history: StoredMessage[] = [
      ...messages,
      { role: 'user', content: userContent },
      { role: 'assistant', content: '', tools: [] },
    ];
    setMessages(history);
    setInput('');
    setStreaming(true);

    const requestId = nextId();
    activeReq.current = requestId;
    send({
      type: 'chat.start',
      requestId,
      model,
      useRun: mode === 'run',
      messages: history
        .filter((m) => m.role !== 'assistant' || m.content.length > 0)
        .map(({ role, content }) => ({ role, content })),
    });
  }

  function handleStop() {
    if (activeReq.current) send({ type: 'cancel', requestId: activeReq.current });
    setStreaming(false);
  }

  function handleNewChat() {
    if (streaming) handleStop();
    setMessages([]);
    setError(null);
    void clearConversation();
  }

  const modelOptions = useMemo(() => {
    const ids = new Set(models.map((m) => m.id));
    if (model) ids.add(model);
    return [...ids];
  }, [models, model]);

  return (
    <div className="chat">
      <div className="chat-controls">
        <select value={model} onChange={(e) => setModel(e.target.value)} title="Model / agent">
          {modelOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <label className="mode" title="Runs API handles long autonomous tasks">
          <input
            type="checkbox"
            checked={mode === 'run'}
            onChange={(e) => setMode(e.target.checked ? 'run' : 'chat')}
          />
          Run mode
        </label>
        <label className="mode" title="Attach the current page's selection/content">
          <input
            type="checkbox"
            checked={attachContext}
            onChange={(e) => setAttachContext(e.target.checked)}
          />
          Page context
        </label>
        <button className="link new-chat" onClick={handleNewChat} title="Start a new conversation">
          New chat
        </button>
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="empty">
            Ask the Hermes Agent anything. Toggle “Page context” to include the current tab.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.tools && m.tools.length > 0 && (
              <details className="tools">
                <summary>{m.tools.length} tool step(s)</summary>
                {m.tools.map((t, j) => (
                  <div key={j} className="tool-line">
                    {t}
                  </div>
                ))}
              </details>
            )}
            <div className="bubble">
              {m.role === 'assistant' ? (
                m.content ? (
                  <Markdown text={m.content} />
                ) : (
                  streaming && i === messages.length - 1 && <span className="cursor">…</span>
                )
              ) : (
                m.content
              )}
            </div>
            {m.role === 'assistant' && m.content && (
              <button
                className="copy"
                title="Copy"
                onClick={() => navigator.clipboard?.writeText(m.content)}
              >
                Copy
              </button>
            )}
          </div>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="composer">
        <textarea
          value={input}
          placeholder="Message the agent…  (Enter to send, Shift+Enter for newline)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        {streaming ? (
          <button className="stop" onClick={handleStop}>
            Stop
          </button>
        ) : (
          <button className="send" disabled={!canSend} onClick={() => void handleSend()}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}

function formatTool(p: { name?: string; message?: string; status?: string }): string {
  return [p.name, p.status, p.message].filter(Boolean).join(' — ') || 'tool step';
}

function formatContext(ctx: PageContext): string {
  const body = ctx.selection || ctx.text;
  return `[Page context]\nTitle: ${ctx.title}\nURL: ${ctx.url}\n${
    ctx.selection ? 'Selection' : 'Content'
  }:\n${body}`;
}
