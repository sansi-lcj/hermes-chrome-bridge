import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type Tab = 'chat' | 'skills' | 'runs' | 'sessions' | 'settings';

interface UiState {
  tab: Tab;
  /** Whether the conversation-list drawer is open. */
  convsOpen: boolean;
  setTab: (tab: Tab) => void;
  setConvsOpen: (open: boolean) => void;
}

/** Which top-level view is active. */
export const useUiStore = create<UiState>()(
  subscribeWithSelector((set) => ({
    tab: 'chat',
    convsOpen: false,
    setTab: (tab) => set({ tab }),
    setConvsOpen: (convsOpen) => set({ convsOpen }),
  })),
);
