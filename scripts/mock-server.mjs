// Local mock Hermes server for hands-on verification — no real backend needed.
// Run `npm run mock`, then point the extension's Settings at http://127.0.0.1:8642.
// The implementation lives in mock-hermes.mjs, shared with the test suites.

import { createMockHermes } from './mock-hermes.mjs';

const PORT = Number(process.env.PORT) || 8642;

createMockHermes({ cors: true, log: console.log }).listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Hermes server on http://127.0.0.1:${PORT}`);
  console.log('In the extension Settings, use that URL and any API key, then Test connection.');
});
