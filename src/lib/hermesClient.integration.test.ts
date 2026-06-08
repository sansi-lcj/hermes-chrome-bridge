import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HermesClient } from './hermesClient';
import { startMockServer, type MockServer } from '../test/mockHermesServer';

// Exercises the real fetch + SSE-parsing path against a loopback HTTP server.
let server: MockServer;
let client: HermesClient;

beforeAll(async () => {
  server = await startMockServer();
  client = new HermesClient({
    baseUrl: server.url,
    apiKey: 'test-key',
    defaultModel: 'hermes',
    mode: 'chat',
  });
});

afterAll(() => server.close());

describe('HermesClient integration (real HTTP + SSE)', () => {
  it('lists models', async () => {
    const ids = (await client.models()).map((m) => m.id);
    expect(ids).toContain('hermes');
    expect(ids).toContain('hermes-pro');
  });

  it('streams a chat completion and assembles deltas', async () => {
    const ac = new AbortController();
    let text = '';
    let done = false;
    for await (const ev of client.chatStream(
      [{ role: 'user', content: 'hi' }],
      'hermes',
      ac.signal,
    )) {
      if (ev.kind === 'delta') text += ev.content;
      if (ev.kind === 'done') done = true;
    }
    expect(text).toBe('Hello world');
    expect(done).toBe(true);
  });

  it('creates a run and streams its events (tool progress + text)', async () => {
    const run = await client.createRun([{ role: 'user', content: 'go' }], 'hermes');
    expect(run.id).toBe('run_1');

    const ac = new AbortController();
    let text = '';
    let sawTool = false;
    for await (const ev of client.runEvents(run.id, ac.signal)) {
      if (ev.event?.includes('tool')) sawTool = true;
      else {
        const d = ev.data as { delta?: string };
        if (typeof d.delta === 'string') text += d.delta;
      }
    }
    expect(sawTool).toBe(true);
    expect(text).toBe('Run done');
  });

  it('fetches skills, toolsets, and sessions', async () => {
    expect((await client.skills())[0].name).toBe('search');
    expect((await client.toolsets())[0].name).toBe('web');
    expect((await client.sessions())[0].id).toBe('s1');
  });

  it('reports a clear error for a missing endpoint', async () => {
    await expect(client.health()).resolves.toBeTruthy();
  });
});
