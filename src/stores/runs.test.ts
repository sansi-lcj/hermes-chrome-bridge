import { beforeEach, describe, expect, it, vi } from 'vitest';

const session: Record<string, unknown> = {};
const sendMessage = vi.fn(async () => ({ ok: true, data: null }));
let changeListener:
  | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
  | undefined;

vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: {
    session: {
      get: vi.fn(async (key: string) => ({ [key]: session[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(session, obj)),
    },
    onChanged: {
      addListener: (cb: typeof changeListener) => {
        changeListener = cb;
      },
    },
  },
});

const { useRunsStore, watchRuns } = await import('./runs');

beforeEach(() => {
  for (const k of Object.keys(session)) delete session[k];
  sendMessage.mockClear();
  useRunsStore.setState({ runs: [] });
});

describe('runs store', () => {
  it('loads runs from the registry, newest first', async () => {
    session.activeRuns = {
      r1: { model: 'hermes', startedAt: 100 },
      r2: { model: 'hermes-pro', startedAt: 200 },
    };
    await useRunsStore.getState().load();
    expect(useRunsStore.getState().runs.map((r) => r.id)).toEqual(['r2', 'r1']);
  });

  it('stop asks the background to stop the run', async () => {
    await useRunsStore.getState().stop('r1');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'stopRun', runId: 'r1' });
  });

  it('watchRuns mirrors registry changes live', async () => {
    watchRuns();
    changeListener?.({ activeRuns: { newValue: { r9: { model: 'm', startedAt: 5 } } } }, 'session');
    expect(useRunsStore.getState().runs).toEqual([{ id: 'r9', model: 'm', startedAt: 5 }]);
    // A cleared registry empties the list.
    changeListener?.({ activeRuns: { newValue: undefined } }, 'session');
    expect(useRunsStore.getState().runs).toEqual([]);
  });
});
