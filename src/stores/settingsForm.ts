import { create } from 'zustand';
import { message } from 'antd';
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

/** Request the host permission and add/update the account; activate it. */
async function persist(get: () => SettingsFormState): Promise<boolean> {
  const { name, baseUrl, apiKey, defaultModel, mode, editingId } = get();
  const origin = originPattern(baseUrl);
  if (!origin) {
    message.error('Enter a valid http(s) URL.');
    return false;
  }
  const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
  if (!granted) {
    message.warning(`Host permission for ${origin} was not granted; requests will fail.`);
    return false;
  }
  const store = useSettingsStore.getState();
  const payload = { name: name.trim() || 'Account', baseUrl, apiKey, defaultModel, mode };
  if (editingId) {
    await store.updateAccount(editingId, payload);
    await store.setActive(editingId);
  } else {
    await store.addAccount(payload);
  }
  return true;
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

  save: async () => {
    set({ busy: true });
    try {
      if (await persist(get)) {
        message.success('Saved.');
        set({ visible: false });
      }
    } finally {
      set({ busy: false });
    }
  },

  test: async () => {
    set({ busy: true });
    try {
      if (!(await persist(get))) return;
      const data = await sendRuntime<{ models: ModelInfo[] }>({
        type: 'api',
        action: 'testConnection',
      });
      const names = data.models?.map((m) => m.id).join(', ') || 'none';
      message.success(`Connected. Models: ${names}`);
    } catch (err) {
      message.error(String(err));
    } finally {
      set({ busy: false });
    }
  },
}));
