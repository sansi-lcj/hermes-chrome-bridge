// Background service worker: the single owner of Hermes network access and the
// hub for Chrome-surface integrations (context menus, commands, omnibox,
// notifications).
//
// - Streams chat / run output to the side panel over a long-lived Port.
// - Runs started via the Runs API keep going even if the panel closes, and
//   raise a desktop notification when they finish.
// - Answers one-off discovery requests (models, skills, sessions, health).
// - Gathers page context from the active tab's content script.

import { HermesClient, HermesError } from '../lib/hermesClient';
import { setPendingPrompt } from '../lib/pending';
import { getSettings } from '../lib/storage';
import type {
  ApiRequest,
  ApiResponse,
  BackgroundToUi,
  ChatMessage,
  PageContext,
  PanelBroadcast,
  UiToBackground,
} from '../lib/types';

const PORT_NAME = 'hermes';
const MENU_ASK = 'hermes-ask-selection';
const MENU_SUMMARIZE = 'hermes-summarize-page';

async function client(): Promise<HermesClient> {
  return new HermesClient(await getSettings());
}

// ---------------------------------------------------------------------------
// Install: panel behavior + context menus
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('setPanelBehavior failed', err));

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ASK,
      title: 'Ask Hermes about “%s”',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU_SUMMARIZE,
      title: 'Summarize this page with Hermes',
      contexts: ['page'],
    });
  });
});

// ---------------------------------------------------------------------------
// Streaming over a long-lived Port
// ---------------------------------------------------------------------------

/** A live link to one panel. Goes dead (post becomes a no-op) on disconnect. */
interface Channel {
  alive: boolean;
  post: (msg: BackgroundToUi) => void;
}

interface ActiveStream {
  controller: AbortController;
  isRun: boolean;
}

const panelPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  panelPorts.add(port);

  const active = new Map<string, ActiveStream>();
  const channel: Channel = {
    alive: true,
    post: (msg) => {
      if (!channel.alive) return;
      try {
        port.postMessage(msg);
      } catch {
        /* port closed */
      }
    },
  };

  port.onMessage.addListener((msg: UiToBackground) => {
    if (msg.type === 'cancel') {
      active.get(msg.requestId)?.controller.abort();
      return;
    }
    if (msg.type === 'chat.start') {
      const controller = new AbortController();
      active.set(msg.requestId, { controller, isRun: msg.useRun });
      void runStream(
        msg.requestId,
        msg.messages,
        msg.model,
        msg.useRun,
        controller,
        channel,
      ).finally(() => active.delete(msg.requestId));
    }
  });

  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
    channel.alive = false; // future posts are dropped
    // Cancel quick chat streams, but let long Runs finish in the background.
    for (const stream of active.values()) {
      if (!stream.isRun) stream.controller.abort();
    }
  });
});

async function runStream(
  requestId: string,
  messages: ChatMessage[],
  model: string,
  useRun: boolean,
  controller: AbortController,
  channel: Channel,
): Promise<void> {
  const hermes = await client();
  try {
    if (useRun) {
      const run = await hermes.createRun(messages, model);
      channel.post({
        type: 'chat.tool',
        requestId,
        progress: { message: `Run started: ${run.id}` },
      });
      controller.signal.addEventListener('abort', () => void hermes.stopRun(run.id));

      let answer = '';
      for await (const ev of hermes.runEvents(run.id, controller.signal)) {
        const text = extractRunText(ev.data);
        if (text) {
          answer += text;
          channel.post({ type: 'chat.delta', requestId, content: text });
        } else {
          channel.post({
            type: 'chat.tool',
            requestId,
            progress: { message: ev.event ?? 'event' },
          });
        }
      }
      channel.post({ type: 'chat.done', requestId });
      // If the panel closed mid-run, ping the user that it finished.
      if (!channel.alive) notifyRunDone(answer);
      return;
    }

    for await (const ev of hermes.chatStream(messages, model, controller.signal)) {
      if (ev.kind === 'delta') channel.post({ type: 'chat.delta', requestId, content: ev.content });
      else if (ev.kind === 'tool')
        channel.post({ type: 'chat.tool', requestId, progress: ev.progress });
      else if (ev.kind === 'done') channel.post({ type: 'chat.done', requestId });
    }
  } catch (err) {
    if (controller.signal.aborted) {
      channel.post({ type: 'chat.done', requestId });
      return;
    }
    channel.post({ type: 'error', requestId, message: errorMessage(err) });
  }
}

/** Best-effort extraction of streamed text from a Runs event payload. */
function extractRunText(data: unknown): string | undefined {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.delta === 'string') return d.delta;
    if (typeof d.content === 'string') return d.content;
    if (typeof d.text === 'string') return d.text;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Context menus, commands, omnibox -> open panel with a pending prompt
// ---------------------------------------------------------------------------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_ASK && info.selectionText) {
    await dispatchPrompt(`About this text:\n\n"""\n${info.selectionText}\n"""\n\n`, false, tab);
  } else if (info.menuItemId === MENU_SUMMARIZE) {
    const ctx = await readPageContext(tab?.id).catch(() => null);
    const body = ctx ? `${ctx.title}\n${ctx.url}\n\n${ctx.text}` : '';
    await dispatchPrompt(`Summarize this page:\n\n${body}`, true, tab);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'open-panel') {
    await openPanel(tab);
  } else if (command === 'new-chat') {
    await openPanel(tab);
    broadcast({ type: 'newChat' });
  }
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  const query = text.trim();
  if (!query) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await dispatchPrompt(query, true, tab);
});

chrome.omnibox.setDefaultSuggestion({
  description: 'Ask the Hermes Agent: type your question and press Enter',
});

/** Store a prompt, open the panel, and notify it (covers open and closed). */
async function dispatchPrompt(
  text: string,
  autoSend: boolean,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  await setPendingPrompt({ text, autoSend });
  await openPanel(tab);
  broadcast({ type: 'pendingPrompt', text, autoSend });
}

/** Open the side panel for the given tab/window (requires a user gesture). */
async function openPanel(tab?: chrome.tabs.Tab): Promise<void> {
  try {
    if (tab?.windowId != null) await chrome.sidePanel.open({ windowId: tab.windowId });
    else {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (active?.windowId != null) await chrome.sidePanel.open({ windowId: active.windowId });
    }
  } catch (err) {
    // If the gesture was consumed, the pending prompt still loads on next open.
    console.warn('sidePanel.open failed', err);
  }
}

function broadcast(msg: PanelBroadcast): void {
  // Best-effort; ignored if no panel is listening.
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

function notifyRunDone(answer: string): void {
  const snippet = answer.trim().slice(0, 180) || 'Your task finished.';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Hermes finished a task',
    message: snippet,
    priority: 1,
  });
}

chrome.notifications.onClicked.addListener(() => void openPanel());

// ---------------------------------------------------------------------------
// One-off discovery + page-context requests
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'api') {
    handleApi(message as ApiRequest)
      .then((data) => sendResponse({ ok: true, data } satisfies ApiResponse))
      .catch((err) => sendResponse({ ok: false, error: errorMessage(err) } satisfies ApiResponse));
    return true; // async response
  }
  if (message?.type === 'getActivePageContext') {
    getActivePageContext()
      .then((ctx) => sendResponse({ ok: true, data: ctx }))
      .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
    return true;
  }
  return false;
});

async function handleApi(req: ApiRequest): Promise<unknown> {
  const hermes = await client();
  switch (req.action) {
    case 'testConnection': {
      // Health first; fall back to /v1/models for servers without /v1/health.
      try {
        await hermes.health();
      } catch {
        await hermes.models();
      }
      return { models: await hermes.models() };
    }
    case 'models':
      return hermes.models();
    case 'skills':
      return hermes.skills();
    case 'toolsets':
      return hermes.toolsets();
    case 'sessions':
      return hermes.sessions();
  }
}

/** Ask the active tab's content script for the current page context. */
async function getActivePageContext(): Promise<PageContext> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return readPageContext(tab?.id);
}

async function readPageContext(tabId?: number): Promise<PageContext> {
  if (tabId == null) throw new Error('No active tab.');
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'getPageContext' });
  } catch {
    throw new Error('Cannot read this page (content script not available on this tab).');
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof HermesError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
