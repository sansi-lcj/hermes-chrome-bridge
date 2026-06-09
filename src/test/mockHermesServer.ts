// A minimal OpenAI-compatible Hermes server for integration/E2E tests. Speaks
// the subset of endpoints the extension uses, including SSE streams and a
// non-streaming tool-call round-trip. Reusable by Vitest and Playwright.

import http from 'node:http';

export interface MockServer {
  url: string;
  close: () => Promise<void>;
}

function json(res: http.ServerResponse, body: unknown): void {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function sse(res: http.ServerResponse, frames: string[]): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const f of frames) res.write(f);
  res.write('data: [DONE]\n\n');
  res.end();
}

const data = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}

interface ChatBody {
  stream?: boolean;
  messages?: Array<{ role?: string; content?: string }>;
}

function chatCompletions(res: http.ServerResponse, body: string): void {
  const parsed = (body ? JSON.parse(body) : {}) as ChatBody;

  // Non-streaming tool loop: first ask -> request a tool; once a tool result is
  // present in the transcript -> return a final answer.
  if (parsed.stream === false) {
    const msgs = parsed.messages ?? [];
    if (msgs.some((m) => m.role === 'tool')) {
      return json(res, {
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Tools done' },
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
  return sse(res, [
    data({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }),
    data({ choices: [{ delta: { content: ' ' }, finish_reason: null }] }),
    data({ choices: [{ delta: { content: 'world' }, finish_reason: null }] }),
  ]);
}

export async function startMockServer(): Promise<MockServer> {
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const method = req.method ?? 'GET';

    if (method === 'GET' && path === '/v1/health') return json(res, { status: 'ok' });
    if (method === 'GET' && path === '/v1/models')
      return json(res, { object: 'list', data: [{ id: 'hermes' }, { id: 'hermes-pro' }] });
    if (method === 'GET' && path === '/v1/skills') return json(res, [{ name: 'search' }]);
    if (method === 'GET' && path === '/v1/toolsets')
      return json(res, { data: [{ name: 'web', tools: ['fetch'] }] });
    if (method === 'GET' && path === '/api/sessions')
      return json(res, [{ id: 's1', title: 'First session' }]);

    if (method === 'POST' && path === '/v1/chat/completions')
      return chatCompletions(res, await readBody(req));
    if (method === 'POST' && path === '/v1/runs')
      return json(res, { id: 'run_1', status: 'queued' });
    if (method === 'GET' && /^\/v1\/runs\/[^/]+\/events$/.test(path)) {
      return sse(res, [
        `event: hermes.tool.progress\n${data({ name: 'search', status: 'running' })}`,
        data({ delta: 'Run ' }),
        data({ delta: 'done' }),
      ]);
    }
    if (method === 'POST' && /^\/v1\/runs\/[^/]+\/stop$/.test(path)) return json(res, { ok: true });

    res.statusCode = 404;
    res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
