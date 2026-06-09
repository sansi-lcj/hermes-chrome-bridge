import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getSettings, setSettings } from '../lib/storage';
import { DEFAULT_SETTINGS, type Settings } from '../lib/types';

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  save: (patch: Partial<Settings>) => Promise<Settings>;
}

/** Observable mirror of the persisted settings (chrome.storage.local). */
export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set) => ({
    ...DEFAULT_SETTINGS,
    loaded: false,
    load: async () => {
      const s = await getSettings();
      set({ ...s, loaded: true });
    },
    save: async (patch) => {
      const next = await setSettings(patch);
      set({ ...next });
      return next;
    },
  })),
);

/** Current persisted values as a plain Settings object. */
export function settingsValues(): Settings {
  const { baseUrl, apiKey, defaultModel, mode } = useSettingsStore.getState();
  return { baseUrl, apiKey, defaultModel, mode };
}

export function isConfigured(): boolean {
  const { baseUrl, apiKey } = useSettingsStore.getState();
  return Boolean(baseUrl && apiKey);
}
