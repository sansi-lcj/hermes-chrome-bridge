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
import { useShallow } from 'zustand/react/shallow';
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
  const chat = useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      input: s.input,
      streaming: s.streaming,
      model: s.model,
      mode: s.mode,
      models: s.models,
      attachContext: s.attachContext,
      onDevice: s.onDevice,
      onDeviceSupported: s.onDeviceSupported,
      agentTools: s.agentTools,
      autoApprove: s.autoApproveActions,
      pendingConfirm: s.pendingConfirm,
    })),
  );
  // Store actions are stable references; this selector never re-renders.
  const act = useChatStore(
    useShallow((s) => ({
      setInput: s.setInput,
      setModel: s.setModel,
      setMode: s.setMode,
      setAttachContext: s.setAttachContext,
      setOnDevice: s.setOnDevice,
      setAgentTools: s.setAgentTools,
      setAutoApprove: s.setAutoApprove,
      resolveConfirm: s.resolveConfirm,
      sendMessage: s.sendMessage,
      stop: s.stop,
      newChat: s.newChat,
    })),
  );

  const configured = useSettingsStore((s) => Boolean(s.baseUrl && s.apiKey));
  const accounts = useSettingsStore((s) => s.accounts);
  const activeId = useSettingsStore((s) => s.activeId);
  const setActive = useSettingsStore((s) => s.setActive);

  const ids = new Set(chat.models.map((m) => m.id));
  if (chat.model) ids.add(chat.model);
  const modelOptions = [...ids].map((id) => ({ value: id, label: id }));

  const items: BubbleItemType[] = chat.messages.map((m, i) => {
    const isLast = i === chat.messages.length - 1;
    return {
      key: String(i),
      role: m.role === 'user' ? 'user' : 'ai',
      content: m.content,
      loading: m.role === 'assistant' && !m.content && chat.streaming && isLast,
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
          value={chat.model}
          onChange={act.setModel}
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
            onClick={act.newChat}
          />
        </Tooltip>
      </header>

      <div className="messages">
        {chat.messages.length === 0 ? (
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
              onItemClick={(info) => act.setInput(String(info.data.label))}
            />
          </div>
        ) : (
          <Bubble.List autoScroll role={ROLE} items={items} />
        )}
      </div>

      {chat.pendingConfirm && (
        <div className="confirm-card" role="alertdialog" aria-label="Confirm action">
          <WarningOutlined className="confirm-ico" />
          <div className="confirm-text">
            Allow the agent to:{' '}
            <b>{actionSummary(chat.pendingConfirm.tool, chat.pendingConfirm.args)}</b>?
          </div>
          <div className="confirm-actions">
            <Button size="small" onClick={() => act.resolveConfirm(false)}>
              Deny
            </Button>
            <Button size="small" type="primary" onClick={() => act.resolveConfirm(true)}>
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
          active={chat.mode === 'run'}
          onChange={(v) => act.setMode(v ? 'run' : 'chat')}
          tooltip="Use the Runs API for long autonomous tasks (turns Tools off)"
        />
        <ToggleChip
          label="Page"
          ariaLabel="Attach page context"
          icon={<FileTextOutlined />}
          active={chat.attachContext}
          onChange={act.setAttachContext}
          tooltip="Attach the current page's selection / content"
        />
        <ToggleChip
          label="Tools"
          ariaLabel="Agent tools"
          icon={<ToolOutlined />}
          active={chat.agentTools}
          onChange={act.setAgentTools}
          tooltip="Let the agent use your browser (read page, click, type, navigate; turns Run off)"
        />
        {chat.agentTools && (
          <ToggleChip
            label="Auto-run"
            ariaLabel="Auto-run actions"
            active={chat.autoApprove}
            onChange={act.setAutoApprove}
            tooltip="Run actions without confirming each one"
          />
        )}
        {chat.onDeviceSupported && (
          <ToggleChip
            label="On-device"
            ariaLabel="Use on-device AI"
            icon={<RobotOutlined />}
            active={chat.onDevice}
            onChange={act.setOnDevice}
            tooltip="Answer locally with Chrome's built-in AI (no network)"
          />
        )}
      </div>

      <div className="composer">
        <Sender
          value={chat.input}
          loading={chat.streaming}
          onChange={act.setInput}
          onSubmit={act.sendMessage}
          onCancel={act.stop}
          placeholder="Message the agent…  (Shift+Enter for newline)"
        />
      </div>
    </div>
  );
}
