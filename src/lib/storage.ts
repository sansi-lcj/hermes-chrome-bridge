import { DEFAULT_SETTINGS, type Settings } from './types';

const KEY = 'settings';

/** Read settings from chrome.storage.local, merged over defaults. */
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
}

/** Persist a partial settings update. Returns the merged result. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch };
  // Normalize: strip trailing slashes from baseUrl so URL joining stays simple.
  next.baseUrl = next.baseUrl.replace(/\/+$/, '');
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (
    changes: { [name: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area === 'local' && changes[KEY]) {
      cb({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
