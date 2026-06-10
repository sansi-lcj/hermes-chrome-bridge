import { Button, Drawer, Dropdown, Empty, Input, Popconfirm, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore, useUiStore } from '../../stores';

/** The conversation list drawer: search, switch, rename, export, delete. */
export function ConversationsDrawer() {
  const s = useChatStore(
    useShallow((c) => ({
      conversations: c.conversations,
      conversationId: c.conversationId,
      searchQuery: c.searchQuery,
      searchHits: c.searchHits,
      newChat: c.newChat,
      selectConversation: c.selectConversation,
      renameConversation: c.renameConversation,
      deleteConversation: c.deleteConversation,
      setSearchQuery: c.setSearchQuery,
      exportConversation: c.exportConversation,
    })),
  );
  const open = useUiStore((u) => u.convsOpen);
  const setOpen = useUiStore((u) => u.setConvsOpen);

  const close = () => setOpen(false);
  const pick = (id: string) => {
    void s.selectConversation(id);
    close();
  };

  // When searching, show only the hits (titles/snippets); otherwise the full list.
  const searching = s.searchQuery.trim().length > 0;
  const rows = searching
    ? (s.searchHits ?? []).map((h) => ({ id: h.id, title: h.title, snippet: h.snippet }))
    : s.conversations.map((c) => ({ id: c.id, title: c.title, snippet: '' }));

  return (
    <Drawer title="Conversations" placement="left" width={280} open={open} onClose={close}>
      <Button
        block
        type="primary"
        icon={<EditOutlined />}
        onClick={() => {
          s.newChat();
          close();
        }}
        style={{ marginBottom: 12 }}
      >
        New chat
      </Button>

      <Input.Search
        allowClear
        placeholder="Search conversations…"
        value={s.searchQuery}
        onChange={(e) => s.setSearchQuery(e.target.value)}
        style={{ marginBottom: 12 }}
        aria-label="Search conversations"
      />

      {rows.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={searching ? 'No matches' : 'No conversations yet'}
        />
      ) : (
        <div className="conv-list">
          {rows.map((row) => (
            <div
              key={row.id}
              className={row.id === s.conversationId ? 'conv-card active' : 'conv-card'}
              role="button"
              tabIndex={0}
              aria-label={`Open conversation ${row.title || 'Untitled'}`}
              onClick={(e) => {
                // Clicks on the rename pencil / its input / a button are their
                // own interactions, not a "select this chat".
                if ((e.target as HTMLElement).closest('button, input, textarea')) return;
                pick(row.id);
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return; // typing in the rename input
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick(row.id);
                }
              }}
            >
              <div className="conv-main">
                <Typography.Text
                  className="conv-title"
                  ellipsis
                  editable={
                    searching
                      ? false
                      : { onChange: (t) => s.renameConversation(row.id, t), tooltip: 'Rename' }
                  }
                >
                  {row.title || 'Untitled'}
                </Typography.Text>
                {row.snippet && row.snippet !== row.title && (
                  <div className="conv-snippet">{row.snippet}</div>
                )}
              </div>
              <div className="conv-actions" onClick={(e) => e.stopPropagation()}>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'md', label: 'Export as Markdown' },
                      { key: 'json', label: 'Export as JSON' },
                    ],
                    onClick: ({ key }) => void s.exportConversation(row.id, key as 'md' | 'json'),
                  }}
                >
                  <Button
                    size="small"
                    type="text"
                    icon={<DownloadOutlined />}
                    aria-label={`Export conversation ${row.title || 'Untitled'}`}
                  />
                </Dropdown>
                <Popconfirm
                  title="Delete this conversation?"
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void s.deleteConversation(row.id)}
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`Delete conversation ${row.title || 'Untitled'}`}
                  />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
