// Local mock Hermes server for hands-on verification — no real backend needed.
// Run `npm run mock`, then point the extension's Settings at http://127.0.0.1:8642.
// Returns deterministic, OpenAI-compatible responses so you can exercise chat
// streaming, the agent tool-loop, and the action-confirmation flow end to end.

import http from 'node:http';

const PORT = Number(process.env.PORT) || 8642;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function json(res, body) {
  cors(res);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
function sse(res, frames) {
  cors(res);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const f of frames) res.write(f);
  res.write('data: [DONE]\n\n');
  res.end();
}
const data = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}

function chatCompletions(res, body) {
  const parsed = body ? JSON.parse(body) : {};
  if (parsed.stream === false) {
    const msgs = parsed.messages ?? [];
    if (msgs.some((m) => m.role === 'tool')) {
      return json(res, {
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'All done — tools ran.' },
            finish_reason: 'stop',
          },
        ],
      });
    }
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
  return sse(res, [
    data({
      choices: [
        { delta: { content: '**Hello** from the mock Hermes server. ' }, finish_reason: null },
      ],
    }),
    data({ choices: [{ delta: { content: 'Streaming works! ' }, finish_reason: null }] }),
    data({ choices: [{ delta: { content: '`SSE` ✅' }, finish_reason: null }] }),
  ]);
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const method = req.method ?? 'GET';
  console.log(`${method} ${path}`);

  if (method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }
  if (method === 'GET' && path === '/v1/health') return json(res, { status: 'ok' });
  if (method === 'GET' && path === '/v1/models')
    return json(res, { object: 'list', data: [{ id: 'hermes' }, { id: 'hermes-pro' }] });
  if (method === 'GET' && path === '/v1/skills')
    return json(res, [{ name: 'web_search', description: 'Search the web' }]);
  if (method === 'GET' && path === '/v1/toolsets')
    return json(res, { data: [{ name: 'browser', tools: ['fetch', 'open'] }] });
  if (method === 'GET' && path === '/api/sessions')
    return json(res, [{ id: 's1', title: 'Yesterday’s research', updated_at: Date.now() }]);

  if (method === 'POST' && path === '/v1/chat/completions')
    return chatCompletions(res, await readBody(req));
  if (method === 'POST' && path === '/v1/runs') return json(res, { id: 'run_1', status: 'queued' });
  if (method === 'GET' && /^\/v1\/runs\/[^/]+\/events$/.test(path))
    return sse(res, [
      `event: hermes.tool.progress\n${data({ name: 'web_search', status: 'running' })}`,
      data({ delta: 'Run output ' }),
      data({ delta: 'streaming ✅' }),
    ]);
  if (method === 'POST' && /^\/v1\/runs\/[^/]+\/stop$/.test(path)) return json(res, { ok: true });

  cors(res);
  res.statusCode = 404;
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Hermes server on http://127.0.0.1:${PORT}`);
  console.log('In the extension Settings, use that URL and any API key, then Test connection.');
});
