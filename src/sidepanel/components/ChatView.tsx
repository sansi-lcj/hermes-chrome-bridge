import { Button, Input, Popover, Select, Tag, Tooltip, Typography } from 'antd';
import {
  CommentOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  LockFilled,
  ReloadOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Bubble, Prompts, ThoughtChain, Welcome } from '@ant-design/x';
import type { BubbleItemType, BubbleListProps } from '@ant-design/x';
import { useShallow } from 'zustand/react/shallow';
import { actionSummary } from '../../lib/actionSummary';
import { feedback } from '../../lib/feedback';
import type { StoredMessage } from '../../lib/conversation';
import { matchProfile } from '../../lib/profiles';
import { useChatStore, useProfilesStore, useSettingsStore, useUiStore } from '../../stores';
import { Composer } from './Composer';
import { ConversationsDrawer } from './ConversationsDrawer';
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

function copyText(text: string): void {
  void navigator.clipboard
    .writeText(text)
    .then(() => feedback.success('Copied.'))
    .catch(() => feedback.error('Copy failed.'));
}

export function ChatView() {
  const chat = useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      system: s.system,
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
      setSystem: s.setSystem,
      resolveConfirm: s.resolveConfirm,
      regenerate: s.regenerate,
      deleteMessage: s.deleteMessage,
      editMessage: s.editMessage,
      newChat: s.newChat,
    })),
  );

  const configured = useSettingsStore((s) => Boolean(s.baseUrl && s.apiKey));
  const accounts = useSettingsStore((s) => s.accounts);
  const activeId = useSettingsStore((s) => s.activeId);
  const setActive = useSettingsStore((s) => s.setActive);
  const setConvsOpen = useUiStore((s) => s.setConvsOpen);
  const profiles = useProfilesStore((s) => s.profiles);
  const activeUrl = useProfilesStore((s) => s.activeUrl);
  const profile = matchProfile(profiles, activeUrl);

  const ids = new Set(chat.models.map((m) => m.id));
  if (chat.model) ids.add(chat.model);
  const modelOptions = [...ids].map((id) => ({ value: id, label: id }));

  const lastIndex = chat.messages.length - 1;
  const items: BubbleItemType[] = chat.messages.map((m, i) => ({
    key: String(i),
    role: m.role === 'user' ? 'user' : 'ai',
    content: m.content,
    loading: m.role === 'assistant' && !m.content && chat.streaming && i === lastIndex,
    footer: messageFooter(m, i),
  }));

  /** Per-message actions (copy / edit / regenerate / delete) + the tool trail. */
  function messageFooter(m: StoredMessage, i: number) {
    const busy = chat.streaming;
    if (busy && i === lastIndex) return undefined;
    return (
      <div className="msg-footer">
        {m.images && m.images.length > 0 && (
          <div className="msg-images">
            {m.images.map((src, j) => (
              <img key={j} src={src} alt={`Attachment ${j + 1}`} />
            ))}
          </div>
        )}
        {m.tools && m.tools.length > 0 && (
          <ThoughtChain
            items={m.tools.map((t, j) => ({
              key: String(j),
              title: t,
              status: 'success' as const,
            }))}
          />
        )}
        <div className="msg-actions">
          <Tooltip title="Copy">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              aria-label="Copy message"
              onClick={() => copyText(m.content)}
            />
          </Tooltip>
          {m.role === 'user' && !busy && (
            <Popover
              trigger="click"
              placement="topRight"
              content={<EditBox initial={m.content} onSave={(text) => act.editMessage(i, text)} />}
            >
              <Tooltip title="Edit & resend">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label="Edit message"
                />
              </Tooltip>
            </Popover>
          )}
          {m.role === 'assistant' && i === lastIndex && !busy && (
            <Tooltip title="Regenerate">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                aria-label="Regenerate answer"
                onClick={act.regenerate}
              />
            </Tooltip>
          )}
          {!busy && (
            <Tooltip title="Delete">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                aria-label="Delete message"
                onClick={() => act.deleteMessage(i)}
              />
            </Tooltip>
          )}
        </div>
      </div>
    );
  }

  const systemEditor = (
    <div className="system-editor">
      <Typography.Text type="secondary">
        System prompt for this conversation (sent ahead of every message):
      </Typography.Text>
      <Input.TextArea
        value={chat.system}
        onChange={(e) => act.setSystem(e.target.value)}
        placeholder="e.g. You are a concise research assistant…"
        autoSize={{ minRows: 3, maxRows: 8 }}
        aria-label="System prompt"
      />
    </div>
  );

  return (
    <div className="chat">
      <header className="chat-header">
        <Tooltip title="Conversations">
          <Button
            type="text"
            size="small"
            icon={<CommentOutlined />}
            aria-label="Conversations"
            onClick={() => setConvsOpen(true)}
          />
        </Tooltip>
        <span className={configured ? 'status-dot ok' : 'status-dot'} aria-hidden />
        {profile && (
          <Tooltip
            title={`Site profile "${profile.label}" is active${
              profile.private ? ' (on-device)' : ''
            }`}
          >
            <Tag
              color={profile.private ? 'warning' : 'processing'}
              icon={profile.private ? <LockFilled /> : undefined}
              className="profile-tag"
              aria-label={`Active site profile ${profile.label}`}
            >
              {profile.label}
            </Tag>
          </Tooltip>
        )}
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
        <Popover content={systemEditor} trigger="click" placement="bottomRight">
          <Tooltip title="System prompt">
            <Button
              type="text"
              size="small"
              icon={<RobotOutlined />}
              aria-label="System prompt"
              className={chat.system.trim() ? 'system-set' : undefined}
            />
          </Tooltip>
        </Popover>
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

      <ConversationsDrawer />

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

      <Composer />
    </div>
  );
}

/** A small uncontrolled-ish edit box used in the message "Edit & resend" popover. */
function EditBox({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  return (
    <div className="edit-box">
      <Input.TextArea
        defaultValue={initial}
        autoSize={{ minRows: 2, maxRows: 8 }}
        aria-label="Edit message"
        onPressEnter={(e) => {
          if (!e.shiftKey) {
            e.preventDefault();
            onSave((e.target as HTMLTextAreaElement).value);
          }
        }}
      />
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        Enter to resend · Shift+Enter for newline
      </Typography.Text>
    </div>
  );
}
