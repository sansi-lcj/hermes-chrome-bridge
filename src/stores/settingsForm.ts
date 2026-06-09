import { create } from 'zustand';
import { message } from 'antd';
import { sendRuntime } from '../lib/messaging';
import { originPattern } from '../lib/url';
import type { ChatMode, ModelInfo } from '../lib/types';
import { settingsValues, useSettingsStore } from './settings';

interface SettingsFormState {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  mode: ChatMode;
  busy: boolean;

  reset: () => void;
  setBaseUrl: (v: string) => void;
  setApiKey: (v: string) => void;
  setDefaultModel: (v: string) => void;
  setMode: (v: ChatMode) => void;
  save: () => Promise<void>;
  test: () => Promise<void>;
}

async function persist(get: () => SettingsFormState): Promise<boolean> {
  const { baseUrl, apiKey, defaultModel, mode } = get();
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
  await useSettingsStore.getState().save({ baseUrl, apiKey, defaultModel, mode });
  return true;
}

/** Editable draft of the settings form, persisted only on Save/Test. */
export const useSettingsFormStore = create<SettingsFormState>((set, get) => ({
  baseUrl: '',
  apiKey: '',
  defaultModel: '',
  mode: 'chat',
  busy: false,

  reset: () => set({ ...settingsValues() }),
  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setApiKey: (apiKey) => set({ apiKey }),
  setDefaultModel: (defaultModel) => set({ defaultModel }),
  setMode: (mode) => set({ mode }),

  save: async () => {
    set({ busy: true });
    try {
      if (await persist(get)) message.success('Saved.');
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
