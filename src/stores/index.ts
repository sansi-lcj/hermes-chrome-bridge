// Singleton store instances + cross-store reactions.
//
// Created once at module load (outside React), so there is no Provider/Context
// and components import these directly — no hooks needed to reach state.

import { reaction } from 'mobx';
import { SettingsStore } from './SettingsStore';
import { UiStore } from './UiStore';
import { CatalogStore } from './CatalogStore';
import { ChatStore } from './ChatStore';
import { SettingsFormStore } from './SettingsFormStore';

export const settingsStore = new SettingsStore();
export const uiStore = new UiStore();
export const catalogStore = new CatalogStore();
export const chatStore = new ChatStore(settingsStore);
export const settingsForm = new SettingsFormStore(settingsStore);

// Lazily load catalog data the first time the user opens those tabs.
reaction(
  () => uiStore.tab,
  (tab) => {
    if (tab === 'skills' && !catalogStore.skillsLoaded) void catalogStore.loadSkills();
    if (tab === 'sessions' && !catalogStore.sessionsLoaded) void catalogStore.loadSessions();
  },
);

// Route a first-time / unconfigured user to Settings once settings have loaded.
reaction(
  () => settingsStore.loaded,
  (loaded) => {
    if (loaded && !settingsStore.configured) uiStore.setTab('settings');
  },
);
