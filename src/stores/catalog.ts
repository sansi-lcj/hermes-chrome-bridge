import { create } from 'zustand';
import { sendRuntime } from '../lib/messaging';
import type { SessionInfo, Skill, Toolset } from '../lib/types';

interface CatalogState {
  skills: Skill[];
  toolsets: Toolset[];
  skillsLoading: boolean;
  skillsLoaded: boolean;
  skillsError: string | null;

  sessions: SessionInfo[];
  sessionsLoading: boolean;
  sessionsLoaded: boolean;
  sessionsError: string | null;

  loadSkills: () => Promise<void>;
  loadSessions: () => Promise<void>;
}

/** Loads and holds the agent's skills/toolsets and prior sessions. */
export const useCatalogStore = create<CatalogState>((set) => ({
  skills: [],
  toolsets: [],
  skillsLoading: false,
  skillsLoaded: false,
  skillsError: null,

  sessions: [],
  sessionsLoading: false,
  sessionsLoaded: false,
  sessionsError: null,

  loadSkills: async () => {
    set({ skillsLoading: true, skillsError: null });
    // Either endpoint may be missing on a given server: keep whatever loaded
    // and surface an error only when both fail.
    const [skills, toolsets] = await Promise.allSettled([
      sendRuntime<Skill[]>({ type: 'api', action: 'skills' }),
      sendRuntime<Toolset[]>({ type: 'api', action: 'toolsets' }),
    ]);
    set({
      skills: skills.status === 'fulfilled' ? skills.value : [],
      toolsets: toolsets.status === 'fulfilled' ? toolsets.value : [],
      skillsError:
        skills.status === 'rejected' && toolsets.status === 'rejected'
          ? String(skills.reason)
          : null,
      skillsLoaded: true,
      skillsLoading: false,
    });
  },

  loadSessions: async () => {
    set({ sessionsLoading: true, sessionsError: null });
    try {
      const sessions = await sendRuntime<SessionInfo[]>({ type: 'api', action: 'sessions' });
      set({ sessions, sessionsLoaded: true });
    } catch (e) {
      set({ sessionsError: String(e) });
    } finally {
      set({ sessionsLoading: false });
    }
  },
}));
