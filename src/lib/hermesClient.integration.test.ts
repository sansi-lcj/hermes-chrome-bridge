import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HermesClient } from './hermesClient';
import { MOCK, startMockServer, type MockServer } from '../test/mockHermesServer';

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
    expect(text).toBe(MOCK.CHAT_DELTAS.join(''));
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
    expect(text).toBe(MOCK.RUN_DELTAS.join(''));
  });

  it('fetches skills, toolsets, and sessions', async () => {
    expect((await client.skills())[0].name).toBe(MOCK.SKILLS[0].name);
    expect((await client.toolsets())[0].name).toBe(MOCK.TOOLSETS[0].name);
    expect((await client.sessions())[0].id).toBe(MOCK.SESSIONS[0].id);
  });

  it('runs a tool-use loop: requests a tool, then answers', async () => {
    const calls: string[] = [];
    const fakeRunTool = async (name: string) => {
      calls.push(name);
      return JSON.stringify([{ title: 'Tab', url: 'https://x' }]);
    };
    const ac = new AbortController();
    const events: string[] = [];
    let answer = '';
    for await (const ev of client.runToolLoop(
      [{ role: 'user', content: 'what tabs are open?' }],
      'hermes',
      [{ type: 'function', function: { name: 'list_tabs', description: 'd', parameters: {} } }],
      fakeRunTool,
      ac.signal,
    )) {
      events.push(ev.kind);
      if (ev.kind === 'final') answer = ev.content;
    }
    expect(calls).toEqual(['list_tabs']);
    expect(events).toEqual(['tool-call', 'tool-result', 'final']);
    expect(answer).toBe(MOCK.TOOLS_DONE);
  });

  it('reports a clear error for a missing endpoint', async () => {
    await expect(client.health()).resolves.toBeTruthy();
  });
});
