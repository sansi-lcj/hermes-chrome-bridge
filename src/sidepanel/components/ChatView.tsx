import { Button, Select, Tooltip } from 'antd';
import {
  EditOutlined,
  FileTextOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Bubble, Prompts, Sender, ThoughtChain, Welcome } from '@ant-design/x';
import type { BubbleItemType, BubbleListProps } from '@ant-design/x';
import { actionSummary } from '../../lib/actionSummary';
import { useChatStore, useSettingsStore } from '../../stores';
import { Markdown } from './Markdown';
import { ToggleChip } from './ToggleChip';

const SUGGESTIONS = [
  { key: 's1', label: 'Summarize the current page', description: 'Uses page context' },
  { key: 's2', label: 'Explain a selected concept', description: 'Paste or select text' },
  { key: 's3', label: 'List my open tabs', description: 'Needs Tools' },
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

  const configured = useSettingsStore((s) => Boolean(s.baseUrl && s.apiKey));
  const accounts = useSettingsStore((s) => s.accounts);
  const activeId = useSettingsStore((s) => s.activeId);
  const setActive = useSettingsStore((s) => s.setActive);

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
      <header className="chat-header">
        <span className={configured ? 'status-dot ok' : 'status-dot'} aria-hidden />
        {accounts.length > 0 && (
          <Select
            size="small"
            variant="borderless"
            value={activeId ?? undefined}
            onChange={(id) => void setActive(id)}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            popupMatchSelectWidth={false}
            aria-label="Account"
            className="account-select"
          />
        )}
        <Select
          size="small"
          variant="borderless"
          value={model}
          onChange={setModel}
          options={modelOptions}
          style={{ minWidth: 90 }}
          popupMatchSelectWidth={false}
        />
        <span className="spacer" />
        <Tooltip title="New chat">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="New chat"
            onClick={newChat}
          />
        </Tooltip>
      </header>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="welcome">
            <Welcome
              variant="borderless"
              icon={<RobotOutlined />}
              title="Hermes Agent"
              description={
                configured
                  ? 'Ask anything, attach the page, or let the agent use your browser.'
                  : 'Open Settings to connect to your Hermes server.'
              }
            />
            <Prompts
              title="Try"
              items={SUGGESTIONS}
              wrap
              onItemClick={(info) => setInput(String(info.data.label))}
            />
          </div>
        ) : (
          <Bubble.List autoScroll role={ROLE} items={items} />
        )}
      </div>

      {pendingConfirm && (
        <div className="confirm-card" role="alertdialog" aria-label="Confirm action">
          <WarningOutlined className="confirm-ico" />
          <div className="confirm-text">
            Allow the agent to: <b>{actionSummary(pendingConfirm.tool, pendingConfirm.args)}</b>?
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

      <div className="chip-row">
        <ToggleChip
          label="Run"
          ariaLabel="Run mode"
          icon={<ThunderboltOutlined />}
          active={mode === 'run'}
          onChange={(v) => setMode(v ? 'run' : 'chat')}
          tooltip="Use the Runs API for long autonomous tasks"
        />
        <ToggleChip
          label="Page"
          ariaLabel="Attach page context"
          icon={<FileTextOutlined />}
          active={attachContext}
          onChange={setAttachContext}
          tooltip="Attach the current page's selection / content"
        />
        <ToggleChip
          label="Tools"
          ariaLabel="Agent tools"
          icon={<ToolOutlined />}
          active={agentTools}
          onChange={setAgentTools}
          tooltip="Let the agent use your browser (read page, click, type, navigate)"
        />
        {agentTools && (
          <ToggleChip
            label="Auto-run"
            ariaLabel="Auto-run actions"
            active={autoApprove}
            onChange={setAutoApprove}
            tooltip="Run actions without confirming each one"
          />
        )}
        {onDeviceSupported && (
          <ToggleChip
            label="On-device"
            ariaLabel="Use on-device AI"
            icon={<RobotOutlined />}
            active={onDevice}
            onChange={setOnDevice}
            tooltip="Answer locally with Chrome's built-in AI (no network)"
          />
        )}
      </div>

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
