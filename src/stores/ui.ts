import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type Tab = 'chat' | 'skills' | 'sessions' | 'settings';

interface UiState {
  tab: Tab;
  setTab: (tab: Tab) => void;
}

/** Which top-level view is active. */
export const useUiStore = create<UiState>()(
  subscribeWithSelector((set) => ({
    tab: 'chat',
    setTab: (tab) => set({ tab }),
  })),
);
