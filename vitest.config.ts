import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so the CRXJS plugin doesn't run during tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      include: ['src/lib/**'],
    },
  },
});
