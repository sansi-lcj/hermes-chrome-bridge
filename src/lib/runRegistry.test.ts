import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      }),
    },
  },
});

const { addRun, removeRun, listRuns } = await import('./runRegistry');

describe('runRegistry', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('starts empty', async () => {
    expect(await listRuns()).toEqual({});
  });

  it('adds and lists runs', async () => {
    await addRun('r1', 'hermes');
    const runs = await listRuns();
    expect(Object.keys(runs)).toEqual(['r1']);
    expect(runs.r1.model).toBe('hermes');
  });

  it('removes a run', async () => {
    await addRun('r1', 'a');
    await addRun('r2', 'b');
    await removeRun('r1');
    expect(Object.keys(await listRuns())).toEqual(['r2']);
  });

  it('removing a missing run is a no-op', async () => {
    await addRun('r1', 'a');
    await removeRun('nope');
    expect(Object.keys(await listRuns())).toEqual(['r1']);
  });
});
