import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(dirname, '../dist-e2e');

/**
 * Loads the unpacked E2E build into a persistent Chromium context. New headless
 * mode supports extensions, so this runs without a display (CI-friendly).
 */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    // `--headless=new` is required to load extensions without a display; the
    // headless:false flag keeps Playwright from forcing the old headless mode.
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
