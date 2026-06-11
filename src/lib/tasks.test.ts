import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
    },
  },
});

const {
  MIN_INTERVAL_MINUTES,
  TASKS_KEY,
  taskAlarmName,
  taskIdFromAlarm,
  normalizeInterval,
  loadTasks,
  saveTasks,
  patchTask,
} = await import('./tasks');
import type { ScheduledTask } from './tasks';

const task = (id: string, over: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id,
  name: id,
  prompt: 'do it',
  intervalMinutes: 60,
  enabled: true,
  ...over,
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('alarm name encoding', () => {
  it('round-trips a task id through the alarm name', () => {
    expect(taskAlarmName('abc')).toBe('task:abc');
    expect(taskIdFromAlarm('task:abc')).toBe('abc');
    expect(taskIdFromAlarm('hermes-other')).toBeNull();
  });
});

describe('normalizeInterval', () => {
  it('clamps to the minimum and rounds', () => {
    expect(normalizeInterval(0)).toBe(MIN_INTERVAL_MINUTES);
    expect(normalizeInterval(-5)).toBe(MIN_INTERVAL_MINUTES);
    expect(normalizeInterval(NaN)).toBe(MIN_INTERVAL_MINUTES);
    expect(normalizeInterval(59.6)).toBe(60);
  });
});

describe('TASKS_KEY', () => {
  it('is the storage key tasks are persisted under', () => {
    expect(TASKS_KEY).toBe('scheduledTasks');
  });
});

describe('persistence', () => {
  it('round-trips and patches tasks', async () => {
    expect(await loadTasks()).toEqual([]);
    await saveTasks([task('a'), task('b', { enabled: false })]);
    expect((await loadTasks()).map((t) => t.id)).toEqual(['a', 'b']);

    await patchTask('a', { lastRunAt: 123, lastResult: 'done' });
    const a = (await loadTasks()).find((t) => t.id === 'a')!;
    expect(a.lastRunAt).toBe(123);
    expect(a.lastResult).toBe('done');
    // patching an unknown id is a no-op (no throw).
    await patchTask('missing', { lastResult: 'x' });
    expect(await loadTasks()).toHaveLength(2);
  });
});
