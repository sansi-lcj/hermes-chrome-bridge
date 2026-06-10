// The single mock Hermes implementation, shared by the dev CLI
// (scripts/mock-server.mjs) and the Vitest/Playwright harness
// (src/test/mockHermesServer.ts) so the two can never drift apart.
//
// Speaks the OpenAI-compatible subset the extension uses: discovery endpoints,
// streaming chat completions (SSE), a non-streaming tool-call round-trip, and
// the Runs API. Responses are deterministic; the canonical strings are exported
// so tests assert against the same source of truth.

import http from 'node:http';

/** Deterministic response fixtures (tests import these). */
export const MOCK = {
  CHAT_DELTAS: ['**Hello** from the mock Hermes server. ', 'Streaming works! ', '`SSE` ✅'],
  TOOLS_DONE: 'All done — tools ran.',
  RUN_DELTAS: ['Run output ', 'streaming ✅'],
  MODELS: [{ id: 'hermes' }, { id: 'hermes-pro' }],
  SKILLS: [{ name: 'web_search', description: 'Search the web' }],
  TOOLSETS: [{ name: 'browser', tools: ['fetch', 'open'] }],
  SESSIONS: [{ id: 's1', title: 'Yesterday’s research', updated_at: Date.now() }],
};

const data = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}

function chatCompletions(res, json, sse, body) {
  const parsed = body ? JSON.parse(body) : {};

  // Non-streaming tool loop: first ask -> request a tool; once a tool result is
  // present in the transcript -> return a final answer.
  if (parsed.stream === false) {
    const msgs = parsed.messages ?? [];
    if (msgs.some((m) => m.role === 'tool')) {
      return json(res, {
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: MOCK.TOOLS_DONE },
            finish_reason: 'stop',
          },
        ],
      });
    }
    // A message mentioning "action" exercises a write tool (needs confirmation).
    const wantsAction = msgs.some(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('action'),
    );
    const fn = wantsAction
      ? { name: 'open_url', arguments: JSON.stringify({ url: 'https://example.com/' }) }
      : { name: 'list_tabs', arguments: '{}' };
    return json(res, {
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'call_1', type: 'function', function: fn }],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
  }

  // Streaming chat completion.
  return sse(
    res,
    MOCK.CHAT_DELTAS.map((content) =>
      data({ choices: [{ delta: { content }, finish_reason: null }] }),
    ),
  );
}

/**
 * Create (but do not start) the mock Hermes HTTP server.
 * @param {{ cors?: boolean, log?: (line: string) => void }} [options]
 *   cors — answer preflights and emit permissive CORS headers (handy when
 *   poking the server from a page); the extension itself doesn't need it.
 *   log — request logger (the dev CLI passes console.log).
 * @returns {http.Server}
 */
export function createMockHermes({ cors = false, log = () => {} } = {}) {
  const withCors = (res) => {
    if (!cors) return;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  };
  const json = (res, body) => {
    withCors(res);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const sse = (res, frames) => {
    withCors(res);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const f of frames) res.write(f);
    res.write('data: [DONE]\n\n');
    res.end();
  };

  return http.createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const method = req.method ?? 'GET';
    log(`${method} ${path}`);

    if (cors && method === 'OPTIONS') {
      withCors(res);
      res.writeHead(204);
      return res.end();
    }
    if (method === 'GET' && path === '/v1/health') return json(res, { status: 'ok' });
    if (method === 'GET' && path === '/v1/models')
      return json(res, { object: 'list', data: MOCK.MODELS });
    if (method === 'GET' && path === '/v1/skills') return json(res, MOCK.SKILLS);
    if (method === 'GET' && path === '/v1/toolsets') return json(res, { data: MOCK.TOOLSETS });
    if (method === 'GET' && path === '/api/sessions') return json(res, MOCK.SESSIONS);

    if (method === 'POST' && path === '/v1/chat/completions')
      return chatCompletions(res, json, sse, await readBody(req));
    if (method === 'POST' && path === '/v1/runs')
      return json(res, { id: 'run_1', status: 'queued' });
    if (method === 'GET' && /^\/v1\/runs\/[^/]+\/events$/.test(path)) {
      return sse(res, [
        `event: hermes.tool.progress\n${data({ name: 'web_search', status: 'running' })}`,
        ...MOCK.RUN_DELTAS.map((delta) => data({ delta })),
      ]);
    }
    if (method === 'POST' && /^\/v1\/runs\/[^/]+\/stop$/.test(path)) return json(res, { ok: true });

    withCors(res);
    res.statusCode = 404;
    res.end('not found');
  });
}
