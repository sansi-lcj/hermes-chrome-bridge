import { Button, Empty, Input, Popconfirm, Select, Space, Typography } from 'antd';
import { CheckCircleFilled, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsFormStore, useSettingsStore } from '../../stores';
import type { ChatMode } from '../../lib/types';

export function SettingsView() {
  const accounts = useSettingsStore((s) => s.accounts);
  const activeId = useSettingsStore((s) => s.activeId);
  const setActive = useSettingsStore((s) => s.setActive);
  const removeAccount = useSettingsStore((s) => s.removeAccount);

  const formVisible = useSettingsFormStore((s) => s.visible);
  const openAdd = useSettingsFormStore((s) => s.openAdd);
  const openEdit = useSettingsFormStore((s) => s.openEdit);

  return (
    <div className="scroll-pane">
      <div className="row-between">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Accounts
        </Typography.Title>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Add account
        </Button>
      </div>

      {accounts.length === 0 && !formVisible && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No accounts yet — add one to connect."
          style={{ marginTop: 24 }}
        />
      )}

      <div className="account-list">
        {accounts.map((a) => (
          <div
            key={a.id}
            className={a.id === activeId ? 'account-card active' : 'account-card'}
            role="button"
            tabIndex={0}
            aria-pressed={a.id === activeId}
            aria-label={`Use account ${a.name}`}
            onClick={() => void setActive(a.id)}
            onKeyDown={(e) => {
              // role="button" must be keyboard-activatable.
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void setActive(a.id);
              }
            }}
          >
            <div className="account-main">
              <div className="account-name">
                {a.id === activeId && <CheckCircleFilled className="account-active-ico" />}
                {a.name}
              </div>
              <div className="account-sub">{a.baseUrl}</div>
            </div>
            <Space onClick={(e) => e.stopPropagation()}>
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                aria-label={`Edit ${a.name}`}
                onClick={() => openEdit(a)}
              />
              <Popconfirm
                title="Delete this account?"
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={() => void removeAccount(a.id)}
              >
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${a.name}`}
                />
              </Popconfirm>
            </Space>
          </div>
        ))}
      </div>

      {formVisible && <AccountForm />}

      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
        Each account has its own base URL, API key and default model — switch the active one from
        the header or by tapping a card. All requests run from the background worker; granting the
        host permission lets it reach your Hermes server without server-side CORS changes.
      </Typography.Paragraph>
    </div>
  );
}

/** Add/edit form, split out so keystrokes re-render only the form itself. */
function AccountForm() {
  const f = useSettingsFormStore(
    useShallow((s) => ({
      editingId: s.editingId,
      name: s.name,
      baseUrl: s.baseUrl,
      apiKey: s.apiKey,
      defaultModel: s.defaultModel,
      mode: s.mode,
      busy: s.busy,
      setName: s.setName,
      setBaseUrl: s.setBaseUrl,
      setApiKey: s.setApiKey,
      setDefaultModel: s.setDefaultModel,
      setMode: s.setMode,
      save: s.save,
      test: s.test,
      close: s.close,
    })),
  );

  return (
    <div className="settings-form" style={{ marginTop: 16 }}>
      <Typography.Title level={5}>{f.editingId ? 'Edit account' : 'New account'}</Typography.Title>
      <label className="field">
        <span>Name</span>
        <Input
          value={f.name}
          placeholder="e.g. Work"
          disabled={f.busy}
          onChange={(e) => f.setName(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Hermes base URL</span>
        <Input
          value={f.baseUrl}
          placeholder="http://127.0.0.1:8642"
          disabled={f.busy}
          onChange={(e) => f.setBaseUrl(e.target.value)}
        />
      </label>
      <label className="field">
        <span>API key (bearer token)</span>
        <Input.Password
          value={f.apiKey}
          placeholder="API_SERVER_KEY"
          disabled={f.busy}
          onChange={(e) => f.setApiKey(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Default model / agent</span>
        <Input
          value={f.defaultModel}
          placeholder="hermes"
          disabled={f.busy}
          onChange={(e) => f.setDefaultModel(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Default mode</span>
        <Select<ChatMode>
          value={f.mode}
          disabled={f.busy}
          onChange={f.setMode}
          options={[
            { value: 'chat', label: 'Chat completions' },
            { value: 'run', label: 'Runs (long tasks)' },
          ]}
        />
      </label>
      <Space>
        <Button type="primary" loading={f.busy} onClick={f.save}>
          Save
        </Button>
        <Button loading={f.busy} onClick={f.test}>
          Test connection
        </Button>
        <Button type="text" onClick={f.close} disabled={f.busy}>
          Cancel
        </Button>
      </Space>
    </div>
  );
}
