import { test, expect, type Page } from './fixtures';
import { startMockServer, type MockServer } from '../src/test/mockHermesServer';

let server: MockServer;

test.beforeAll(async () => {
  server = await startMockServer();
});

test.afterAll(async () => {
  await server.close();
});

/** Open the panel and add an account pointing at the mock server (becomes active). */
async function configure(page: Page, extensionId: string, name = 'Test', save = true) {
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await addAccount(page, name, save);
}

/** Add an account via the Settings form (assumes the Settings tab is showing). */
async function addAccount(page: Page, name: string, save = true) {
  await page.getByRole('button', { name: /Add account/ }).click();
  await page.getByPlaceholder('e.g. Work').fill(name);
  await page.getByPlaceholder('http://127.0.0.1:8642').fill(server.url);
  await page.getByPlaceholder('API_SERVER_KEY').fill('test-key');
  if (save) {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.').first()).toBeVisible();
  }
}

const gotoChat = (page: Page) => page.getByLabel('segmented control').getByText('Chat').click();

test('configure connection, then stream a chat answer end-to-end', async ({
  page,
  extensionId,
}) => {
  await configure(page, extensionId);

  await gotoChat(page);
  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('hello');
  await composer.press('Enter');

  // The mock streams "Hello world" via SSE; it should render in the bubble.
  await expect(page.getByText('Hello world')).toBeVisible();
});

test('agent tools: the agent calls a browser tool, then answers', async ({ page, extensionId }) => {
  await configure(page, extensionId);

  await gotoChat(page);
  await page.getByLabel('Agent tools').click(); // enable tool use

  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('what tabs do I have open?');
  await composer.press('Enter');

  await expect(page.getByText('Tools done')).toBeVisible();
  await expect(page.getByText(/list_tabs/).first()).toBeVisible();
});

test('write tools ask for confirmation before running', async ({ page, extensionId }) => {
  await configure(page, extensionId);

  await gotoChat(page);
  await page.getByLabel('Agent tools').click(); // tools on; Ask mode by default

  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('please run an action');
  await composer.press('Enter');

  // A confirmation prompt appears for the write tool with a readable summary.
  await expect(page.getByText(/Open https:\/\/example\.com/)).toBeVisible();
  await page.getByRole('button', { name: 'Allow' }).click();
  await expect(page.getByText('Tools done')).toBeVisible();
});

test('Test connection reports the mock models', async ({ page, extensionId }) => {
  await configure(page, extensionId, 'Test', false); // fill the form but don't Save
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/Connected\. Models:/)).toBeVisible();
});

test('multi-account: switch accounts with isolated chat history', async ({ page, extensionId }) => {
  // Account "Alpha" + a message.
  await configure(page, extensionId, 'Alpha');
  await gotoChat(page);
  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('hi from alpha');
  await composer.press('Enter');
  await expect(page.getByText('Hello world')).toBeVisible();

  // Add a second account "Beta" (becomes active) — its conversation is empty.
  await page.getByLabel('segmented control').getByText('Settings').click();
  await addAccount(page, 'Beta');
  await gotoChat(page);
  await expect(page.getByText('hi from alpha')).toHaveCount(0);

  // Switch back to Alpha via the header account selector — its history returns.
  await page.getByLabel('Account').click();
  await page.getByRole('option', { name: 'Alpha' }).click();
  await expect(page.getByText('hi from alpha')).toBeVisible();
});
