// Test harness around the shared mock Hermes implementation (Vitest +
// Playwright both use this; the dev CLI wraps the same core in scripts/).

import { createMockHermes, MOCK } from '../../scripts/mock-hermes.mjs';

export { MOCK };

export interface MockServer {
  url: string;
  close: () => Promise<void>;
}

/** Start the mock Hermes on an ephemeral loopback port. */
export async function startMockServer(): Promise<MockServer> {
  const server = createMockHermes();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
