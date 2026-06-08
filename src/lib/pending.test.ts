import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory chrome.storage.session mock, installed before importing the module.
const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      }),
      remove: vi.fn(async (key: string) => {
        delete store[key];
      }),
    },
  },
});

const { setPendingPrompt, takePendingPrompt } = await import('./pending');

describe('pending prompt', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('returns null when nothing is pending', async () => {
    expect(await takePendingPrompt()).toBeNull();
  });

  it('round-trips a stored prompt', async () => {
    await setPendingPrompt({ text: 'hi', autoSend: true });
    expect(await takePendingPrompt()).toEqual({ text: 'hi', autoSend: true });
  });

  it('consumes the prompt exactly once', async () => {
    await setPendingPrompt({ text: 'once', autoSend: false });
    expect(await takePendingPrompt()).toEqual({ text: 'once', autoSend: false });
    // A second consumer (e.g. the broadcast poke racing the mount read) gets nothing.
    expect(await takePendingPrompt()).toBeNull();
  });
});
