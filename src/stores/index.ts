// Zustand stores + one-time side-effect wiring. Components import the hooks
// from here; `initStores()` (called once from main) loads settings, connects
// the Port, and sets up cross-store subscriptions.

import { shallow } from 'zustand/shallow';
import { saveConversation } from '../lib/conversation';
import { onSettingsChanged } from '../lib/storage';
import { initChat, loadModels, useChatStore } from './chat';
import { useCatalogStore } from './catalog';
import { isConfigured, useSettingsStore } from './settings';
import { useSettingsFormStore } from './settingsForm';
import { useUiStore } from './ui';

export { useChatStore } from './chat';
export { useCatalogStore } from './catalog';
export { useSettingsStore } from './settings';
export { useSettingsFormStore } from './settingsForm';
export { useUiStore } from './ui';
export type { Tab } from './ui';

let initialized = false;

export function initStores(): void {
  if (initialized) return;
  initialized = true;

  // Mirror external storage changes into the settings store.
  onSettingsChanged((s) => useSettingsStore.setState({ ...s }));

  // Keep chat defaults in sync with settings; reload models when the server changes.
  useSettingsStore.subscribe(
    (s) => [s.defaultModel, s.mode] as const,
    ([defaultModel, mode]) => useChatStore.setState({ model: defaultModel, mode }),
    { equalityFn: shallow },
  );
  useSettingsStore.subscribe(
    (s) => [s.baseUrl, s.apiKey] as const,
    () => void loadModels(),
    { equalityFn: shallow, fireImmediately: true },
  );

  // Seed the settings-form draft and route unconfigured users to Settings.
  useSettingsStore.subscribe(
    (s) => s.loaded,
    (loaded) => {
      if (!loaded) return;
      useSettingsFormStore.getState().reset();
      if (!isConfigured()) useUiStore.getState().setTab('settings');
    },
  );

  // Lazily load catalog data the first time those tabs are opened.
  useUiStore.subscribe(
    (s) => s.tab,
    (tab) => {
      const c = useCatalogStore.getState();
      if (tab === 'skills' && !c.skillsLoaded) void c.loadSkills();
      if (tab === 'sessions' && !c.sessionsLoaded) void c.loadSessions();
    },
  );

  // Persist whenever a turn completes (skip mid-stream churn).
  useChatStore.subscribe(
    (s) => ({ streaming: s.streaming, messages: s.messages }),
    ({ streaming, messages }) => {
      if (!streaming && messages.length > 0) void saveConversation(messages);
    },
    { equalityFn: shallow },
  );

  initChat();
  void useSettingsStore.getState().load();
}
