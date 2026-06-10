import { useState } from 'react';
import { Button, Empty, Input, Popconfirm, Space, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useTemplatesStore } from '../../stores';
import type { PromptTemplate } from '../../lib/templates';

interface Draft {
  id: string | null;
  name: string;
  description: string;
  body: string;
}

const EMPTY: Draft = { id: null, name: '', description: '', body: '' };

/** Manage quick-command prompt templates (invoked with "/" in the composer). */
export function QuickCommands() {
  const { templates, addTemplate, updateTemplate, removeTemplate } = useTemplatesStore(
    useShallow((s) => ({
      templates: s.templates,
      addTemplate: s.addTemplate,
      updateTemplate: s.updateTemplate,
      removeTemplate: s.removeTemplate,
    })),
  );
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim().replace(/^\//, '');
    const payload = { name, description: draft.description.trim(), body: draft.body };
    if (!name || !payload.body.trim()) return;
    if (draft.id) await updateTemplate(draft.id, payload);
    else await addTemplate(payload);
    setDraft(null);
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div className="row-between">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Quick commands
        </Typography.Title>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setDraft({ ...EMPTY })}>
          Add command
        </Button>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
        Type <code>/name</code> in the composer to insert a template. Bodies can use{' '}
        <code>{'{{selection}}'}</code>, <code>{'{{page}}'}</code>, <code>{'{{url}}'}</code>,{' '}
        <code>{'{{title}}'}</code>, <code>{'{{clipboard}}'}</code>, and <code>{'{{input}}'}</code>.
      </Typography.Paragraph>

      {templates.length === 0 && !draft && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No commands yet" />
      )}

      <div className="account-list">
        {templates.map((t) => (
          <CommandCard
            key={t.id}
            template={t}
            onEdit={() => setDraft({ ...t })}
            onDelete={() => void removeTemplate(t.id)}
          />
        ))}
      </div>

      {draft && (
        <div className="settings-form" style={{ marginTop: 12 }}>
          <Typography.Title level={5}>{draft.id ? 'Edit command' : 'New command'}</Typography.Title>
          <label className="field">
            <span>Name (used as /name)</span>
            <Input
              value={draft.name}
              placeholder="summarize"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <Input
              value={draft.description}
              placeholder="Summarize the current page"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Body</span>
            <Input.TextArea
              value={draft.body}
              placeholder="Summarize this page:\n\n{{page}}"
              autoSize={{ minRows: 3, maxRows: 10 }}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <Space>
            <Button type="primary" onClick={() => void save()}>
              Save
            </Button>
            <Button type="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </Space>
        </div>
      )}
    </div>
  );
}

function CommandCard({
  template,
  onEdit,
  onDelete,
}: {
  template: PromptTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="account-card">
      <div className="account-main">
        <div className="account-name">/{template.name}</div>
        <div className="account-sub">{template.description || template.body.slice(0, 60)}</div>
      </div>
      <Space>
        <Button
          size="small"
          type="text"
          icon={<EditOutlined />}
          aria-label={`Edit command ${template.name}`}
          onClick={onEdit}
        />
        <Popconfirm
          title="Delete this command?"
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={onDelete}
        >
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete command ${template.name}`}
          />
        </Popconfirm>
      </Space>
    </div>
  );
}
