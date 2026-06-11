import { create } from 'zustand';
import { sendRuntime } from '../lib/messaging';
import { listRuns, RUNS_KEY, type ActiveRun } from '../lib/runRegistry';

export interface RunEntry extends ActiveRun {
  id: string;
}

interface RunsState {
  runs: RunEntry[];
  load: () => Promise<void>;
  stop: (id: string) => Promise<void>;
}

const toEntries = (map: Record<string, ActiveRun>): RunEntry[] =>
  Object.entries(map)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => b.startedAt - a.startedAt);

/** Live view of in-flight Runs (the persisted registry the background owns). */
export const useRunsStore = create<RunsState>((set) => ({
  runs: [],
  load: async () => {
    set({ runs: toEntries(await listRuns()) });
  },
  stop: async (id) => {
    await sendRuntime({ type: 'stopRun', runId: id });
    // The background removes it from the registry; the storage listener refreshes.
  },
}));

/** Mirror registry changes (runs starting/finishing in the background) live. */
export function watchRuns(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'session' || area === 'local') && changes[RUNS_KEY]) {
      const next = changes[RUNS_KEY].newValue as Record<string, ActiveRun> | undefined;
      useRunsStore.setState({ runs: toEntries(next ?? {}) });
    }
  });
}
