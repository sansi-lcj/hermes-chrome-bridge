import { Button, Select, Switch, Tooltip } from 'antd';
import { EditOutlined, FileTextOutlined, RobotOutlined, ToolOutlined } from '@ant-design/icons';
import { Bubble, Prompts, Sender, ThoughtChain, Welcome } from '@ant-design/x';
import type { BubbleItemType, BubbleListProps } from '@ant-design/x';
import { useChatStore } from '../../stores';
import { Markdown } from './Markdown';

const SUGGESTIONS = [
  { key: 's1', label: 'Summarize the current page', description: 'Uses page context' },
  { key: 's2', label: 'Explain a selected concept', description: 'Paste or select text' },
  { key: 's3', label: 'Draft a reply', description: 'Give the agent the thread' },
];

// Static role config (no per-render allocation needed).
const ROLE: BubbleListProps['role'] = {
  user: { placement: 'end', variant: 'shadow' },
  ai: {
    placement: 'start',
    variant: 'filled',
    contentRender: (content) => <Markdown text={String(content)} />,
  },
};

export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const input = useChatStore((s) => s.input);
  const streaming = useChatStore((s) => s.streaming);
  const model = useChatStore((s) => s.model);
  const mode = useChatStore((s) => s.mode);
  const models = useChatStore((s) => s.models);
  const attachContext = useChatStore((s) => s.attachContext);
  const onDevice = useChatStore((s) => s.onDevice);
  const onDeviceSupported = useChatStore((s) => s.onDeviceSupported);
  const agentTools = useChatStore((s) => s.agentTools);
  const autoApprove = useChatStore((s) => s.autoApproveActions);
  const pendingConfirm = useChatStore((s) => s.pendingConfirm);

  const setInput = useChatStore((s) => s.setInput);
  const setModel = useChatStore((s) => s.setModel);
  const setMode = useChatStore((s) => s.setMode);
  const setAttachContext = useChatStore((s) => s.setAttachContext);
  const setOnDevice = useChatStore((s) => s.setOnDevice);
  const setAgentTools = useChatStore((s) => s.setAgentTools);
  const setAutoApprove = useChatStore((s) => s.setAutoApprove);
  const resolveConfirm = useChatStore((s) => s.resolveConfirm);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stop = useChatStore((s) => s.stop);
  const newChat = useChatStore((s) => s.newChat);

  const ids = new Set(models.map((m) => m.id));
  if (model) ids.add(model);
  const modelOptions = [...ids].map((id) => ({ value: id, label: id }));

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
            aria-label="Run mode"
            checked={mode === 'run'}
            onChange={(v) => setMode(v ? 'run' : 'chat')}
            checkedChildren="Run"
            unCheckedChildren="Chat"
          />
        </Tooltip>
        <Tooltip title="Attach the current page's selection/content">
          <Switch
            size="small"
            aria-label="Attach page context"
            checked={attachContext}
            onChange={setAttachContext}
            checkedChildren={<FileTextOutlined />}
            unCheckedChildren={<FileTextOutlined />}
          />
        </Tooltip>
        <Tooltip title="Let the agent use browser tools (read page, list tabs, click, type, navigate)">
          <Switch
            size="small"
            aria-label="Agent tools"
            checked={agentTools}
            onChange={setAgentTools}
            checkedChildren="Tools"
            unCheckedChildren={<ToolOutlined />}
          />
        </Tooltip>
        {agentTools && (
          <Tooltip title="Run actions (click, type, navigate) without confirming each one">
            <Switch
              size="small"
              aria-label="Auto-run actions"
              checked={autoApprove}
              onChange={setAutoApprove}
              checkedChildren="Auto"
              unCheckedChildren="Ask"
            />
          </Tooltip>
        )}
        {onDeviceSupported && (
          <Tooltip title="Answer on-device with Chrome's built-in AI (private, no network)">
            <Switch
              size="small"
              aria-label="Use on-device AI"
              checked={onDevice}
              onChange={setOnDevice}
              checkedChildren="On-device"
              unCheckedChildren={<RobotOutlined />}
            />
          </Tooltip>
        )}
        <Button size="small" icon={<EditOutlined />} onClick={newChat} className="new-chat">
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
          <Bubble.List autoScroll role={ROLE} items={items} />
        )}
      </div>

      {pendingConfirm && (
        <div className="confirm-card">
          <div className="confirm-text">
            Allow <b>{pendingConfirm.tool}</b>
            <span className="confirm-args">{pendingConfirm.args}</span>?
          </div>
          <div className="confirm-actions">
            <Button size="small" onClick={() => resolveConfirm(false)}>
              Deny
            </Button>
            <Button size="small" type="primary" onClick={() => resolveConfirm(true)}>
              Allow
            </Button>
          </div>
        </div>
      )}

      <div className="composer">
        <Sender
          value={input}
          loading={streaming}
          onChange={setInput}
          onSubmit={sendMessage}
          onCancel={stop}
          placeholder="Message the agent…  (Shift+Enter for newline)"
        />
      </div>
    </div>
  );
}
