import { observer } from 'mobx-react-lite';
import { Button, Select, Switch, Tooltip } from 'antd';
import { EditOutlined, FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import { Bubble, Prompts, Sender, ThoughtChain, Welcome } from '@ant-design/x';
import type { BubbleItemType, BubbleListProps } from '@ant-design/x';
import { chatStore } from '../../stores';
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

export const ChatView = observer(function ChatView() {
  const s = chatStore;

  const items: BubbleItemType[] = s.messages.map((m, i) => {
    const isLast = i === s.messages.length - 1;
    return {
      key: String(i),
      role: m.role === 'user' ? 'user' : 'ai',
      content: m.content,
      loading: m.role === 'assistant' && !m.content && s.streaming && isLast,
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
          value={s.model}
          onChange={s.setModel}
          options={s.modelOptions}
          style={{ minWidth: 120 }}
          popupMatchSelectWidth={false}
        />
        <Tooltip title="Use the Runs API for long autonomous tasks">
          <Switch
            size="small"
            checked={s.mode === 'run'}
            onChange={(v) => s.setMode(v ? 'run' : 'chat')}
            checkedChildren="Run"
            unCheckedChildren="Chat"
          />
        </Tooltip>
        <Tooltip title="Attach the current page's selection/content">
          <Switch
            size="small"
            aria-label="Attach page context"
            checked={s.attachContext}
            onChange={s.setAttachContext}
            checkedChildren={<FileTextOutlined />}
            unCheckedChildren={<FileTextOutlined />}
          />
        </Tooltip>
        {s.onDeviceSupported && (
          <Tooltip title="Answer on-device with Chrome's built-in AI (private, no network)">
            <Switch
              size="small"
              aria-label="Use on-device AI"
              checked={s.onDevice}
              onChange={s.setOnDevice}
              checkedChildren="On-device"
              unCheckedChildren={<RobotOutlined />}
            />
          </Tooltip>
        )}
        <Button size="small" icon={<EditOutlined />} onClick={s.newChat} className="new-chat">
          New chat
        </Button>
      </div>

      <div className="messages">
        {s.messages.length === 0 ? (
          <div className="welcome">
            <Welcome
              variant="borderless"
              title="Hermes Agent"
              description="Ask anything, or attach the current page as context."
            />
            <Prompts
              title="Try"
              items={SUGGESTIONS}
              onItemClick={(info) => s.setInput(String(info.data.label))}
            />
          </div>
        ) : (
          <Bubble.List autoScroll role={ROLE} items={items} />
        )}
      </div>

      <div className="composer">
        <Sender
          value={s.input}
          loading={s.streaming}
          onChange={s.setInput}
          onSubmit={s.sendMessage}
          onCancel={s.stop}
          placeholder="Message the agent…  (Shift+Enter for newline)"
        />
      </div>
    </div>
  );
});
