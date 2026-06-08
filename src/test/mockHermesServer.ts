// A minimal OpenAI-compatible Hermes server for integration/E2E tests. Speaks
// the subset of endpoints the extension uses, including SSE streams. Reusable
// by Vitest integration tests today and by a Playwright harness later.

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

export async function startMockServer(): Promise<MockServer> {
  const server = http.createServer((req, res) => {
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

    if (method === 'POST' && path === '/v1/chat/completions') {
      return sse(res, [
        data({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }),
        data({ choices: [{ delta: { content: ' ' }, finish_reason: null }] }),
        data({ choices: [{ delta: { content: 'world' }, finish_reason: null }] }),
      ]);
    }
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
