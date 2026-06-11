import { create } from 'zustand';
import {
  loadTasks,
  newTaskId,
  normalizeInterval,
  saveTasks,
  type ScheduledTask,
} from '../lib/tasks';

interface TasksState {
  tasks: ScheduledTask[];
  loaded: boolean;
  load: () => Promise<void>;
  addTask: (t: Omit<ScheduledTask, 'id'>) => Promise<void>;
  updateTask: (id: string, patch: Partial<Omit<ScheduledTask, 'id'>>) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
}

/** Scheduled tasks (digests / monitoring); the background runs them on alarms. */
export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loaded: false,

  load: async () => {
    set({ tasks: await loadTasks(), loaded: true });
  },
  addTask: async (t) => {
    const tasks = [
      ...get().tasks,
      { ...t, id: newTaskId(), intervalMinutes: normalizeInterval(t.intervalMinutes) },
    ];
    set({ tasks });
    await saveTasks(tasks);
  },
  updateTask: async (id, patch) => {
    const next = patch.intervalMinutes
      ? { ...patch, intervalMinutes: normalizeInterval(patch.intervalMinutes) }
      : patch;
    const tasks = get().tasks.map((t) => (t.id === id ? { ...t, ...next } : t));
    set({ tasks });
    await saveTasks(tasks);
  },
  removeTask: async (id) => {
    const tasks = get().tasks.filter((t) => t.id !== id);
    set({ tasks });
    await saveTasks(tasks);
  },
}));

/** Mirror external task changes (background writing lastResult) into the store. */
export function watchTasks(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.scheduledTasks) {
      const next = changes.scheduledTasks.newValue as ScheduledTask[] | undefined;
      if (Array.isArray(next)) useTasksStore.setState({ tasks: next });
    }
  });
}
