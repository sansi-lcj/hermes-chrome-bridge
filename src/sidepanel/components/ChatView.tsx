import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Select, Switch, Tooltip } from 'antd';
import { EditOutlined, FileTextOutlined } from '@ant-design/icons';
import { Bubble, Prompts, Sender, ThoughtChain, Welcome } from '@ant-design/x';
import type { BubbleItemType, BubbleListProps } from '@ant-design/x';
import type {
  BackgroundToUi,
  ChatMode,
  ModelInfo,
  PageContext,
  PanelBroadcast,
  Settings,
} from '../../lib/types';
import {
  clearConversation,
  loadConversation,
  saveConversation,
  type StoredMessage,
} from '../../lib/conversation';
import { takePendingPrompt } from '../../lib/pending';
import { sendRuntime, usePort } from '../hooks/usePort';
import { Markdown } from './Markdown';

let counter = 0;
const nextId = () => `req-${Date.now()}-${counter++}`;

const SUGGESTIONS = [
  { key: 's1', label: 'Summarize the current page', description: 'Uses page context' },
  { key: 's2', label: 'Explain a selected concept', description: 'Paste or select text' },
  { key: 's3', label: 'Draft a reply', description: 'Give the agent the thread' },
];

export function ChatView({ settings }: { settings: Settings }) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>(settings.mode);
  const [model, setModel] = useState(settings.defaultModel);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [attachContext, setAttachContext] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const activeReq = useRef<string | null>(null);

  const { send } = usePort((msg: BackgroundToUi) => {
    if (msg.requestId !== activeReq.current) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      const updated: StoredMessage = { ...last };
      if (msg.type === 'chat.delta') updated.content = last.content + msg.content;
      else if (msg.type === 'chat.tool')
        updated.tools = [...(last.tools ?? []), formatTool(msg.progress)];
      else if (msg.type === 'error') updated.content = last.content + `\n\n> ⚠️ ${msg.message}`;
      else return prev;
      return [...prev.slice(0, -1), updated];
    });
    if (msg.type === 'chat.done' || msg.type === 'error') {
      setStreaming(false);
      activeReq.current = null;
    }
  });

  // Restore persisted conversation on mount.
  useEffect(() => {
    loadConversation().then(setMessages);
  }, []);

  useEffect(() => {
    setModel(settings.defaultModel);
    setMode(settings.mode);
  }, [settings.defaultModel, settings.mode]);

  // Refresh the model list whenever the connection settings change.
  useEffect(() => {
    sendRuntime<ModelInfo[]>({ type: 'api', action: 'models' })
      .then(setModels)
      .catch(() => setModels([]));
  }, [settings.baseUrl, settings.apiKey]);

  // Persist completed turns.
  useEffect(() => {
    if (!streaming && messages.length > 0) void saveConversation(messages);
  }, [streaming, messages]);

  // --- Prompt dispatch (composer, suggestions, context menu, omnibox) -------

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const finalize = (content: string) => {
      const history: StoredMessage[] = [
        ...messages,
        { role: 'user', content },
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
    };

    if (attachContext) {
      sendRuntime<PageContext>({ type: 'getActivePageContext' })
        .then((ctx) => finalize(`${trimmed}\n\n${formatContext(ctx)}`))
        .catch(() => finalize(trimmed));
    } else {
      finalize(trimmed);
    }
  }

  function handleStop() {
    if (activeReq.current) send({ type: 'cancel', requestId: activeReq.current });
    setStreaming(false);
  }

  function handleNewChat() {
    if (streaming) handleStop();
    setMessages([]);
    void clearConversation();
  }

  // Keep the latest handlers reachable from the once-registered listener.
  const apply = (text: string, autoSend: boolean) => {
    setInput(text);
    if (autoSend) sendMessage(text);
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const newChatRef = useRef(handleNewChat);
  newChatRef.current = handleNewChat;

  // Consume a pending prompt on open and whenever an entry point pokes us.
  // Storage is the single source of truth (consumed once), so a prompt is never
  // applied twice across the mount-read and the live-poke paths.
  useEffect(() => {
    const consume = () =>
      takePendingPrompt().then((p) => p && applyRef.current(p.text, p.autoSend));
    consume();
    const listener = (msg: PanelBroadcast) => {
      if (msg.type === 'pendingPrompt') consume();
      else if (msg.type === 'newChat') newChatRef.current();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // --- Rendering ------------------------------------------------------------

  const role = useMemo<BubbleListProps['role']>(
    () => ({
      user: { placement: 'end', variant: 'shadow' },
      ai: {
        placement: 'start',
        variant: 'filled',
        contentRender: (content) => <Markdown text={String(content)} />,
      },
    }),
    [],
  );

  const items: BubbleItemType[] = messages.map((m, i) => {
    const isLast = i === messages.length - 1;
    return {
      key: String(i),
      role: m.role === 'user' ? 'user' : 'ai',
      content: m.content,
      loading: m.role === 'assistant' && !m.content && streaming && isLast,
      footer:
        m.tools && m.tools.length > 0 ? (
          <ThoughtChain
            items={m.tools.map((t, j) => ({
              key: String(j),
              title: t,
              status: 'success' as const,
            }))}
          />
        ) : undefined,
    };
  });

  const modelOptions = useMemo(() => {
    const ids = new Set(models.map((m) => m.id));
    if (model) ids.add(model);
    return [...ids].map((id) => ({ value: id, label: id }));
  }, [models, model]);

  return (
    <div className="chat">
      <div className="chat-toolbar">
        <Select
          size="small"
          value={model}
          onChange={setModel}
          options={modelOptions}
          style={{ minWidth: 120 }}
          popupMatchSelectWidth={false}
        />
        <Tooltip title="Use the Runs API for long autonomous tasks">
          <Switch
            size="small"
            checked={mode === 'run'}
            onChange={(v) => setMode(v ? 'run' : 'chat')}
            checkedChildren="Run"
            unCheckedChildren="Chat"
          />
        </Tooltip>
        <Tooltip title="Attach the current page's selection/content">
          <Switch
            size="small"
            checked={attachContext}
            onChange={setAttachContext}
            checkedChildren={<FileTextOutlined />}
            unCheckedChildren={<FileTextOutlined />}
          />
        </Tooltip>
        <Button size="small" icon={<EditOutlined />} onClick={handleNewChat} className="new-chat">
          New chat
        </Button>
      </div>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="welcome">
            <Welcome
              variant="borderless"
              title="Hermes Agent"
              description="Ask anything, or attach the current page as context."
            />
            <Prompts
              title="Try"
              items={SUGGESTIONS}
              onItemClick={(info) => setInput(String(info.data.label))}
            />
          </div>
        ) : (
          <Bubble.List autoScroll role={role} items={items} />
        )}
      </div>

      <div className="composer">
        <Sender
          value={input}
          loading={streaming}
          onChange={setInput}
          onSubmit={(text) => sendMessage(text)}
          onCancel={handleStop}
          placeholder="Message the agent…  (Shift+Enter for newline)"
        />
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
