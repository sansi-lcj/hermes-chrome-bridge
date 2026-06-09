import { test, expect } from './fixtures';
import { startMockServer, type MockServer } from '../src/test/mockHermesServer';

let server: MockServer;

test.beforeAll(async () => {
  server = await startMockServer();
});

test.afterAll(async () => {
  await server.close();
});

test('configure connection, then stream a chat answer end-to-end', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

  // First run opens on Settings (unconfigured). Fill in the mock server.
  await page.getByPlaceholder('http://127.0.0.1:8642').fill(server.url);
  await page.getByPlaceholder('API_SERVER_KEY').fill('test-key');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  // Switch to Chat (scope to the segmented nav to avoid the Run/Chat switch).
  await page.getByLabel('segmented control').getByText('Chat').click();
  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('hello');
  await composer.press('Enter');

  // The mock streams "Hello world" via SSE; it should render in the bubble.
  await expect(page.getByText('Hello world')).toBeVisible();
});

test('agent tools: the agent calls a browser tool, then answers', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await page.getByPlaceholder('http://127.0.0.1:8642').fill(server.url);
  await page.getByPlaceholder('API_SERVER_KEY').fill('test-key');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.getByLabel('segmented control').getByText('Chat').click();
  await page.getByLabel('Agent tools').click(); // enable tool use

  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('what tabs do I have open?');
  await composer.press('Enter');

  // The agent requests list_tabs (shown in the tool trail) and then answers.
  await expect(page.getByText('Tools done')).toBeVisible();
  await expect(page.getByText(/list_tabs/).first()).toBeVisible();
});

test('Test connection reports the mock models', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await page.getByPlaceholder('http://127.0.0.1:8642').fill(server.url);
  await page.getByPlaceholder('API_SERVER_KEY').fill('test-key');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/Connected\. Models:/)).toBeVisible();
});
