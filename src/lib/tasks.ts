// Scheduled tasks: run a saved prompt on a fixed interval in the background and
// notify with the result. The backbone for digests ("every morning, summarize
// X") and lightweight monitoring ("every hour, check Y and tell me if it
// changed"). Backed by chrome.alarms; stored under `scheduledTasks`.

export interface ScheduledTask {
  id: string;
  /** Friendly name shown in the list and notification title. */
  name: string;
  /** The prompt run on each tick (tools/page context are not used). */
  prompt: string;
  /** How often to run, in minutes (Chrome's alarm minimum is 1). */
  intervalMinutes: number;
  enabled: boolean;
  /** Epoch ms of the last run, and a snippet of its result (for the UI). */
  lastRunAt?: number;
  lastResult?: string;
}

export const TASKS_KEY = 'scheduledTasks';
const KEY = TASKS_KEY;
const ALARM_PREFIX = 'task:';
/** Chrome won't schedule periodic alarms faster than once per minute. */
export const MIN_INTERVAL_MINUTES = 1;

export function newTaskId(): string {
  return `task-${crypto.randomUUID()}`;
}

export const taskAlarmName = (id: string): string => `${ALARM_PREFIX}${id}`;

/** The task id encoded in an alarm name, or null if it isn't a task alarm. */
export function taskIdFromAlarm(alarmName: string): string | null {
  return alarmName.startsWith(ALARM_PREFIX) ? alarmName.slice(ALARM_PREFIX.length) : null;
}

/** Clamp a requested interval to Chrome's minimum. */
export function normalizeInterval(minutes: number): number {
  return Number.isFinite(minutes) && minutes >= MIN_INTERVAL_MINUTES
    ? Math.round(minutes)
    : MIN_INTERVAL_MINUTES;
}

export async function loadTasks(): Promise<ScheduledTask[]> {
  const res = await chrome.storage.local.get(KEY);
  const stored = res[KEY] as ScheduledTask[] | undefined;
  return Array.isArray(stored) ? stored : [];
}

export async function saveTasks(tasks: ScheduledTask[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: tasks });
}

/** Update one task in storage (read-modify-write); used by the background tick. */
export async function patchTask(id: string, patch: Partial<ScheduledTask>): Promise<void> {
  const tasks = await loadTasks();
  await saveTasks(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
}
