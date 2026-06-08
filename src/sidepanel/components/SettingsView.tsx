import { useState } from 'react';
import { App, Button, Form, Input, Select, Space, Typography } from 'antd';
import { setSettings } from '../../lib/storage';
import type { ChatMode, ModelInfo, Settings } from '../../lib/types';
import { originPattern } from '../../lib/url';
import { sendRuntime } from '../hooks/usePort';

export function SettingsView({ settings }: { settings: Settings }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Settings>();
  const [busy, setBusy] = useState(false);

  async function persist(values: Settings): Promise<boolean> {
    const origin = originPattern(values.baseUrl);
    if (!origin) {
      message.error('Enter a valid http(s) URL.');
      return false;
    }
    const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!granted) {
      message.warning(`Host permission for ${origin} was not granted; requests will fail.`);
      return false;
    }
    await setSettings(values);
    return true;
  }

  async function handleSave() {
    const values = await form.validateFields();
    setBusy(true);
    try {
      if (await persist(values)) message.success('Saved.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    const values = await form.validateFields();
    setBusy(true);
    try {
      if (!(await persist(values))) return;
      const data = await sendRuntime<{ models: ModelInfo[] }>({
        type: 'api',
        action: 'testConnection',
      });
      const names = data.models?.map((m) => m.id).join(', ') || 'none';
      message.success(`Connected. Models: ${names}`);
    } catch (err) {
      message.error(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scroll-pane">
      <Form<Settings> form={form} layout="vertical" initialValues={settings} disabled={busy}>
        <Form.Item
          label="Hermes base URL"
          name="baseUrl"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input placeholder="http://127.0.0.1:8642" />
        </Form.Item>

        <Form.Item label="API key (bearer token)" name="apiKey">
          <Input.Password placeholder="API_SERVER_KEY" />
        </Form.Item>

        <Form.Item label="Default model / agent" name="defaultModel">
          <Input placeholder="hermes" />
        </Form.Item>

        <Form.Item label="Default mode" name="mode">
          <Select<ChatMode>
            options={[
              { value: 'chat', label: 'Chat completions' },
              { value: 'run', label: 'Runs (long tasks)' },
            ]}
          />
        </Form.Item>

        <Space>
          <Button type="primary" loading={busy} onClick={handleSave}>
            Save
          </Button>
          <Button onClick={handleTest} loading={busy}>
            Test connection
          </Button>
        </Space>
      </Form>

      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
        All requests run from the extension background worker. Granting the host permission lets it
        reach your Hermes server without server-side CORS changes.
      </Typography.Paragraph>
    </div>
  );
}
