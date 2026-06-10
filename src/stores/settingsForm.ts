import { create } from 'zustand';
import { feedback } from '../lib/feedback';
import { sendRuntime } from '../lib/messaging';
import { originPattern } from '../lib/url';
import { DEFAULT_SETTINGS, type Account, type ChatMode, type ModelInfo } from '../lib/types';
import { useSettingsStore } from './settings';

interface SettingsFormState {
  visible: boolean;
  editingId: string | null;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  mode: ChatMode;
  busy: boolean;

  openAdd: () => void;
  openEdit: (account: Account) => void;
  close: () => void;
  setName: (v: string) => void;
  setBaseUrl: (v: string) => void;
  setApiKey: (v: string) => void;
  setDefaultModel: (v: string) => void;
  setMode: (v: ChatMode) => void;
  save: () => Promise<void>;
  test: () => Promise<void>;
}

/**
 * Validate the URL and make sure the host permission is granted (required for
 * the background worker to reach the server at all). Pure side effect on the
 * browser's permission state — does not touch the accounts store.
 */
async function ensureHostPermission(baseUrl: string): Promise<boolean> {
  const origin = originPattern(baseUrl);
  if (!origin) {
    feedback.error('Enter a valid http(s) URL.');
    return false;
  }
  let granted: boolean;
  try {
    granted = await chrome.permissions.request({ origins: [origin] });
  } catch (err) {
    feedback.error(`Host permission request failed: ${String(err)}`);
    return false;
  }
  if (!granted) {
    feedback.warning(`Host permission for ${origin} was not granted; requests will fail.`);
  }
  return granted;
}

const blank = {
  visible: false,
  editingId: null as string | null,
  name: '',
  baseUrl: '',
  apiKey: '',
  defaultModel: DEFAULT_SETTINGS.defaultModel,
  mode: 'chat' as ChatMode,
  busy: false,
};

export const useSettingsFormStore = create<SettingsFormState>((set, get) => ({
  ...blank,

  openAdd: () => set({ ...blank, visible: true }),
  openEdit: (a) =>
    set({
      visible: true,
      editingId: a.id,
      name: a.name,
      baseUrl: a.baseUrl,
      apiKey: a.apiKey,
      defaultModel: a.defaultModel,
      mode: a.mode,
      busy: false,
    }),
  close: () => set({ visible: false }),
  setName: (name) => set({ name }),
  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setApiKey: (apiKey) => set({ apiKey }),
  setDefaultModel: (defaultModel) => set({ defaultModel }),
  setMode: (mode) => set({ mode }),

  /** Persist the account (add or update) and activate it. */
  save: async () => {
    const { name, baseUrl, apiKey, defaultModel, mode, editingId } = get();
    set({ busy: true });
    try {
      if (!(await ensureHostPermission(baseUrl))) return;
      const store = useSettingsStore.getState();
      const payload = { name: name.trim() || 'Account', baseUrl, apiKey, defaultModel, mode };
      if (editingId) {
        await store.updateAccount(editingId, payload);
        await store.setActive(editingId);
      } else {
        await store.addAccount(payload);
      }
      feedback.success('Saved.');
      set({ visible: false });
    } finally {
      set({ busy: false });
    }
  },

  /** Probe the connection the form describes — without saving anything. */
  test: async () => {
    const { baseUrl, apiKey, defaultModel, mode } = get();
    set({ busy: true });
    try {
      if (!(await ensureHostPermission(baseUrl))) return;
      const data = await sendRuntime<{ models: ModelInfo[] }>({
        type: 'api',
        action: 'testConnection',
        settings: { baseUrl, apiKey, defaultModel, mode },
      });
      const names = data.models?.map((m) => m.id).join(', ') || 'none';
      feedback.success(`Connected. Models: ${names}`);
    } catch (err) {
      feedback.error(String(err));
    } finally {
      set({ busy: false });
    }
  },
}));
