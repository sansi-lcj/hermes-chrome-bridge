import { test, expect, type Page } from './fixtures';
import { MOCK, startMockServer, type MockServer } from '../src/test/mockHermesServer';

// A streamed-answer substring that survives Markdown rendering (the leading
// "**Hello**" becomes a <strong>, so match on the plain part).
const STREAMED_ANSWER = 'Streaming works!';

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

  // The mock streams a Markdown answer via SSE; it should render in the bubble.
  await expect(page.getByText(STREAMED_ANSWER)).toBeVisible();
});

test('agent tools: the agent calls a browser tool, then answers', async ({ page, extensionId }) => {
  await configure(page, extensionId);

  await gotoChat(page);
  await page.getByLabel('Agent tools').click(); // enable tool use

  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('what tabs do I have open?');
  await composer.press('Enter');

  await expect(page.getByText(MOCK.TOOLS_DONE)).toBeVisible();
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
  await expect(page.getByText(MOCK.TOOLS_DONE)).toBeVisible();
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
  await expect(page.getByText(STREAMED_ANSWER)).toBeVisible();

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

test('conversations: new chat keeps the old one; switching back restores it', async ({
  page,
  extensionId,
}) => {
  await configure(page, extensionId);
  await gotoChat(page);
  const composer = page.getByPlaceholder(/Message the agent/);
  const messages = page.locator('.messages');

  await composer.fill('first question');
  await composer.press('Enter');
  await expect(messages.getByText(STREAMED_ANSWER)).toBeVisible();

  // New chat clears the panel but keeps the old conversation in the list.
  await page.getByLabel('New chat').click();
  await expect(messages.getByText('first question')).toHaveCount(0);
  await composer.fill('second question');
  await composer.press('Enter');
  await expect(messages.getByText(STREAMED_ANSWER)).toBeVisible();

  // Switch back through the conversations drawer (titled from the first message).
  // Click the title text itself — the row also carries a rename pencil.
  await page.getByLabel('Conversations').click();
  await page.getByLabel('Open conversation first question').getByText('first question').click();
  await expect(messages.getByText('first question')).toBeVisible();
  await expect(messages.getByText('second question')).toHaveCount(0);
});

test('quick commands: a "/" template expands into the composer', async ({ page, extensionId }) => {
  await configure(page, extensionId);
  await gotoChat(page);

  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('/translate');
  // The command menu lists the seeded starter templates.
  await expect(page.getByRole('option', { name: /\/translate/ })).toBeVisible();
  await page.getByRole('option', { name: /\/translate/ }).click();
  // The body expands into the composer (no page selection, so it's the shell).
  await expect(composer).toHaveValue(/Translate to English/);
});

test('conversation search filters the drawer to matches', async ({ page, extensionId }) => {
  await configure(page, extensionId);
  await gotoChat(page);
  const composer = page.getByPlaceholder(/Message the agent/);
  await composer.fill('tell me about quokkas');
  await composer.press('Enter');
  await expect(page.locator('.messages').getByText(STREAMED_ANSWER)).toBeVisible();

  await page.getByLabel('Conversations').click();
  await page.getByLabel('Search conversations').fill('quokka');
  await expect(page.getByLabel(/Open conversation tell me about quokkas/)).toBeVisible();
  await page.getByLabel('Search conversations').fill('nonexistent-xyz');
  await expect(page.getByText('No matches')).toBeVisible();
});

// Note: screenshot capture (chrome.tabs.captureVisibleTab) is exercised by unit
// tests around the chat store's multimodal payload; it can't run in the headless
// harness because the panel page isn't a capturable web tab.
