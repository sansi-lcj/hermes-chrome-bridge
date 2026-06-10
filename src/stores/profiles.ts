import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  loadProfiles,
  matchProfile,
  newProfileId,
  saveProfiles,
  type SiteProfile,
} from '../lib/profiles';

interface ProfilesState {
  profiles: SiteProfile[];
  loaded: boolean;
  /** The active tab's URL (tracked from the panel), used to match a profile. */
  activeUrl: string;

  load: () => Promise<void>;
  setActiveUrl: (url: string) => void;
  addProfile: (p: Omit<SiteProfile, 'id'>) => Promise<void>;
  updateProfile: (id: string, patch: Partial<Omit<SiteProfile, 'id'>>) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
}

/** Site profiles + the active tab URL they're matched against. */
export const useProfilesStore = create<ProfilesState>()(
  subscribeWithSelector((set, get) => ({
    profiles: [],
    loaded: false,
    activeUrl: '',

    load: async () => {
      set({ profiles: await loadProfiles(), loaded: true });
    },
    setActiveUrl: (activeUrl) => set({ activeUrl }),
    addProfile: async (p) => {
      const profiles = [...get().profiles, { id: newProfileId(), ...p }];
      set({ profiles });
      await saveProfiles(profiles);
    },
    updateProfile: async (id, patch) => {
      const profiles = get().profiles.map((p) => (p.id === id ? { ...p, ...patch } : p));
      set({ profiles });
      await saveProfiles(profiles);
    },
    removeProfile: async (id) => {
      const profiles = get().profiles.filter((p) => p.id !== id);
      set({ profiles });
      await saveProfiles(profiles);
    },
  })),
);

/** The profile matching the active tab URL, or null. */
export function activeProfile(): SiteProfile | null {
  const { profiles, activeUrl } = useProfilesStore.getState();
  return matchProfile(profiles, activeUrl);
}
