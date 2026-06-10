// Zustand stores + one-time side-effect wiring. Components import the hooks
// from here; `initStores()` (called once from main) loads accounts, connects
// the Port, and sets up cross-store subscriptions.

import { shallow } from 'zustand/shallow';
import { onAccountsChanged } from '../lib/accounts';
import { saveConversation } from '../lib/conversation';
import {
  getConversationAccountId,
  initChat,
  loadActiveConversation,
  loadModels,
  useChatStore,
} from './chat';
import { useCatalogStore } from './catalog';
import { isConfigured, useSettingsStore } from './settings';
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

  // Mirror external account changes (e.g. another panel) into the store.
  onAccountsChanged((state) => useSettingsStore.getState().apply(state));

  // Keep chat defaults in sync with the active account; reload models when the
  // active connection changes.
  useSettingsStore.subscribe(
    (s) => [s.defaultModel, s.mode] as const,
    ([defaultModel, mode]) => {
      useChatStore.setState({ model: defaultModel });
      useChatStore.getState().setMode(mode); // via the action: keeps Run/Tools exclusive
    },
    { equalityFn: shallow },
  );
  useSettingsStore.subscribe(
    (s) => [s.baseUrl, s.apiKey] as const,
    () => void loadModels(),
    { equalityFn: shallow, fireImmediately: true },
  );

  // Switch conversation history when the active account changes (also fires once
  // after accounts load to populate the initial conversation).
  useSettingsStore.subscribe(
    (s) => s.activeId,
    () => void loadActiveConversation(),
  );

  // Route an unconfigured user to Settings once accounts have loaded.
  useSettingsStore.subscribe(
    (s) => s.loaded,
    (loaded) => {
      if (loaded && !isConfigured()) useUiStore.getState().setTab('settings');
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

  // Persist the conversation whenever a turn completes — under the account the
  // messages belong to (not the currently active one, which may already have
  // changed mid-stream during an account switch).
  useChatStore.subscribe(
    (s) => ({ streaming: s.streaming, messages: s.messages }),
    ({ streaming, messages }) => {
      if (!streaming && messages.length > 0) {
        void saveConversation(getConversationAccountId(), messages);
      }
    },
    { equalityFn: shallow },
  );

  initChat();
  void useSettingsStore.getState().load();
}
