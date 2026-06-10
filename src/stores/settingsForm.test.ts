import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerFeedback } from '../lib/feedback';

const toasts = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
registerFeedback(toasts);

const stored: Record<string, unknown> = {};
const sendMessage = vi.fn(async () => ({ ok: true, data: { models: [{ id: 'hermes' }] } }));
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of arr) if (k in stored) out[k] = stored[k];
        return out;
      }),
      set: vi.fn(async (o: Record<string, unknown>) => Object.assign(stored, o)),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  permissions: { request: vi.fn(async () => true) },
  runtime: { sendMessage },
});

const { useSettingsFormStore } = await import('./settingsForm');
const { useSettingsStore } = await import('./settings');

const fillForm = () => {
  const f = useSettingsFormStore.getState();
  f.openAdd();
  f.setName('Work');
  f.setBaseUrl('http://127.0.0.1:8642');
  f.setApiKey('secret');
};

describe('settings form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(stored)) delete stored[k];
    useSettingsStore.setState({ accounts: [], activeId: null });
  });

  it('Test connection probes the form draft without saving an account', async () => {
    fillForm();
    await useSettingsFormStore.getState().test();
    await useSettingsFormStore.getState().test(); // repeated clicks must not accumulate state

    expect(useSettingsStore.getState().accounts).toHaveLength(0);
    // The probe carries the (unsaved) form values to the background.
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'testConnection',
        settings: expect.objectContaining({ baseUrl: 'http://127.0.0.1:8642', apiKey: 'secret' }),
      }),
    );
    expect(toasts.success).toHaveBeenCalledWith(expect.stringContaining('hermes'));
  });

  it('Save then Test keeps exactly one account', async () => {
    fillForm();
    await useSettingsFormStore.getState().save();
    fillForm();
    await useSettingsFormStore.getState().test();
    expect(useSettingsStore.getState().accounts).toHaveLength(1);
  });

  it('reports a failed permission request as an error, not a denial', async () => {
    (chrome.permissions.request as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('invalid pattern'),
    );
    fillForm();
    await useSettingsFormStore.getState().save();
    expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining('invalid pattern'));
    expect(useSettingsStore.getState().accounts).toHaveLength(0);
  });
});
