import { useState } from 'react';
import { setSettings } from '../../lib/storage';
import type { ChatMode, ModelInfo, Settings } from '../../lib/types';
import { sendRuntime } from '../hooks/usePort';

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

export function SettingsView({ settings }: { settings: Settings }) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [defaultModel, setDefaultModel] = useState(settings.defaultModel);
  const [mode, setMode] = useState<ChatMode>(settings.mode);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function save(): Promise<boolean> {
    setStatus({ kind: 'saving' });
    const origin = originPattern(baseUrl);
    if (!origin) {
      setStatus({ kind: 'error', message: 'Enter a valid http(s) URL.' });
      return false;
    }
    // Grant the service worker permission to call this origin without CORS.
    const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!granted) {
      setStatus({
        kind: 'error',
        message: `Host permission for ${origin} was not granted; requests will fail.`,
      });
      return false;
    }
    await setSettings({ baseUrl, apiKey, defaultModel, mode });
    return true;
  }

  async function handleSave() {
    if (await save()) setStatus({ kind: 'ok', message: 'Saved.' });
  }

  async function handleTest() {
    if (!(await save())) return;
    setStatus({ kind: 'saving' });
    try {
      const data = await sendRuntime<{ models: ModelInfo[] }>({
        type: 'api',
        action: 'testConnection',
      });
      const names = data.models?.map((m) => m.id).join(', ') || 'none';
      setStatus({ kind: 'ok', message: `Connected. Models: ${names}` });
    } catch (err) {
      setStatus({ kind: 'error', message: String(err) });
    }
  }

  return (
    <div className="settings">
      <label className="field">
        <span>Hermes base URL</span>
        <input
          type="text"
          value={baseUrl}
          placeholder="http://127.0.0.1:8642"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>

      <label className="field">
        <span>API key (bearer token)</span>
        <input
          type="password"
          value={apiKey}
          placeholder="API_SERVER_KEY"
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Default model / agent</span>
        <input
          type="text"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Default mode</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as ChatMode)}>
          <option value="chat">Chat completions</option>
          <option value="run">Runs (long tasks)</option>
        </select>
      </label>

      <div className="actions">
        <button className="send" onClick={() => void handleSave()} disabled={status.kind === 'saving'}>
          Save
        </button>
        <button className="link" onClick={() => void handleTest()} disabled={status.kind === 'saving'}>
          Test connection
        </button>
      </div>

      {status.kind === 'saving' && <div className="loading">Working…</div>}
      {status.kind === 'ok' && <div className="ok-banner">{status.message}</div>}
      {status.kind === 'error' && <div className="error-banner">{status.message}</div>}

      <p className="hint">
        All requests run from the extension background worker. Granting the host permission lets it
        reach your Hermes server without server-side CORS changes.
      </p>
    </div>
  );
}

/** Build a `<scheme>://<host>/*` match pattern from a base URL, or null. */
function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}
