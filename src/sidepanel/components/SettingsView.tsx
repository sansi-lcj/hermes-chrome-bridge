import { observer } from 'mobx-react-lite';
import { Button, Input, Select, Space, Typography } from 'antd';
import { settingsForm } from '../../stores';
import type { ChatMode } from '../../lib/types';

export const SettingsView = observer(function SettingsView() {
  const f = settingsForm;

  return (
    <div className="scroll-pane">
      <div className="settings-form">
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
        </Space>
      </div>

      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
        All requests run from the extension background worker. Granting the host permission lets it
        reach your Hermes server without server-side CORS changes.
      </Typography.Paragraph>
    </div>
  );
});
