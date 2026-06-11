// Zustand stores + one-time side-effect wiring. Components import the hooks
// from here; `initStores()` (called once from main) loads accounts, connects
// the Port, and sets up cross-store subscriptions.

import { shallow } from 'zustand/shallow';
import { onAccountsChanged } from '../lib/accounts';
import { saveMessages } from '../lib/conversation';
import {
  getConversationAccountId,
  initChat,
  loadActiveConversation,
  loadModels,
  useChatStore,
} from './chat';
import { useCatalogStore } from './catalog';
import { activeProfile, useProfilesStore } from './profiles';
import { isConfigured, useSettingsStore } from './settings';
import { useTasksStore, watchTasks } from './tasks';
import { useTemplatesStore } from './templates';
import { useUiStore } from './ui';

export { useChatStore } from './chat';
export { useCatalogStore } from './catalog';
export { useProfilesStore, activeProfile } from './profiles';
export { useSettingsStore } from './settings';
export { useSettingsFormStore } from './settingsForm';
export { useTasksStore } from './tasks';
export { useTemplatesStore } from './templates';
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

  // Persist messages whenever a turn completes (or one is deleted) — under the
  // account/conversation the messages belong to. conversationId and messages
  // are always set together, so this pair can never mix two conversations; a
  // null conversationId is an unmaterialized draft with nothing to save.
  useChatStore.subscribe(
    (s) => ({ streaming: s.streaming, messages: s.messages, conversationId: s.conversationId }),
    ({ streaming, messages, conversationId }) => {
      if (!streaming && conversationId) {
        void saveMessages(getConversationAccountId(), conversationId, messages);
      }
    },
    { equalityFn: shallow },
  );

  // Seed a draft chat from the matching site profile: its system prompt,
  // auto page-context, and (for "private" hosts) on-device routing. Only drafts
  // are seeded — an in-progress conversation is never altered.
  const seedDraftFromProfile = () => {
    const chat = useChatStore.getState();
    if (chat.conversationId !== null) return; // only seed a fresh draft
    const prof = activeProfile();
    if (!prof) return;
    const patch: Record<string, unknown> = {};
    if (prof.system && !chat.system) patch.system = prof.system;
    if (prof.autoPageContext && !chat.attachContext) patch.attachContext = true;
    if (prof.private && !chat.onDevice) patch.onDevice = true;
    if (Object.keys(patch).length > 0) useChatStore.setState(patch);
  };
  useProfilesStore.subscribe((s) => [s.activeUrl, s.profiles] as const, seedDraftFromProfile, {
    equalityFn: shallow,
  });
  useChatStore.subscribe((s) => s.conversationId, seedDraftFromProfile);

  initChat();
  initActiveTabTracking();
  watchTasks(); // reflect background-written task results back into the UI
  void useSettingsStore.getState().load();
  void useTemplatesStore.getState().load();
  void useProfilesStore.getState().load();
  void useTasksStore.getState().load();
}

/** Track the active tab's URL so site profiles can match it. */
function initActiveTabTracking(): void {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  const set = (url: string | undefined) => useProfilesStore.getState().setActiveUrl(url ?? '');
  const refresh = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => set(tab?.url));
  };
  refresh();
  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onUpdated.addListener((_id, info, tab) => {
    if (tab.active && info.url) set(info.url);
  });
  chrome.windows?.onFocusChanged.addListener(refresh);
}
