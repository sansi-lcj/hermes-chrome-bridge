// Tracks in-flight Runs so they survive a service-worker restart. MV3 workers
// are terminated when idle; on restart the background reads this registry and
// reconnects to each Run's event stream instead of silently losing it.

export const RUNS_KEY = 'activeRuns';
const KEY = RUNS_KEY;

export interface ActiveRun {
  model: string;
  startedAt: number;
}

/** Storage area the registry lives in (session, falling back to local). */
export function runsArea(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

const area = runsArea;

export async function listRuns(): Promise<Record<string, ActiveRun>> {
  const res = await area().get(KEY);
  return (res[KEY] as Record<string, ActiveRun> | undefined) ?? {};
}

export async function addRun(runId: string, model: string): Promise<void> {
  const runs = await listRuns();
  runs[runId] = { model, startedAt: Date.now() };
  await area().set({ [KEY]: runs });
}

export async function removeRun(runId: string): Promise<void> {
  const runs = await listRuns();
  if (runId in runs) {
    delete runs[runId];
    await area().set({ [KEY]: runs });
  }
}
