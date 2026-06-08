// Background service worker: the single owner of Hermes network access.
//
// - Streams chat / run output to the side panel over a long-lived Port.
// - Answers one-off discovery requests (models, skills, sessions, health).
// - Gathers page context from the active tab's content script.

import { HermesClient, HermesError } from '../lib/hermesClient';
import { getSettings } from '../lib/storage';
import type {
  ApiRequest,
  ApiResponse,
  BackgroundToUi,
  ChatMessage,
  PageContext,
  UiToBackground,
} from '../lib/types';

// Open the side panel when the toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('setPanelBehavior failed', err));
});

async function client(): Promise<HermesClient> {
  return new HermesClient(await getSettings());
}

// ---------------------------------------------------------------------------
// Streaming over a long-lived Port
// ---------------------------------------------------------------------------

const PORT_NAME = 'hermes';

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  // One in-flight stream per requestId, cancellable via AbortController.
  const active = new Map<string, AbortController>();

  const post = (msg: BackgroundToUi) => {
    try {
      port.postMessage(msg);
    } catch {
      /* port closed */
    }
  };

  port.onMessage.addListener((msg: UiToBackground) => {
    if (msg.type === 'cancel') {
      active.get(msg.requestId)?.abort();
      return;
    }
    if (msg.type === 'chat.start') {
      const controller = new AbortController();
      active.set(msg.requestId, controller);
      void runStream(msg.requestId, msg.messages, msg.model, msg.useRun, controller, post).finally(
        () => active.delete(msg.requestId),
      );
    }
  });

  port.onDisconnect.addListener(() => {
    for (const c of active.values()) c.abort();
    active.clear();
  });
});

async function runStream(
  requestId: string,
  messages: ChatMessage[],
  model: string,
  useRun: boolean,
  controller: AbortController,
  post: (msg: BackgroundToUi) => void,
): Promise<void> {
  const hermes = await client();
  try {
    if (useRun) {
      const run = await hermes.createRun(messages, model);
      post({ type: 'chat.tool', requestId, progress: { message: `Run started: ${run.id}` } });
      controller.signal.addEventListener('abort', () => void hermes.stopRun(run.id));
      for await (const ev of hermes.runEvents(run.id, controller.signal)) {
        const text = extractRunText(ev.data);
        if (text) post({ type: 'chat.delta', requestId, content: text });
        else post({ type: 'chat.tool', requestId, progress: { message: ev.event ?? 'event' } });
      }
      post({ type: 'chat.done', requestId });
      return;
    }

    for await (const ev of hermes.chatStream(messages, model, controller.signal)) {
      if (ev.kind === 'delta') post({ type: 'chat.delta', requestId, content: ev.content });
      else if (ev.kind === 'tool') post({ type: 'chat.tool', requestId, progress: ev.progress });
      else if (ev.kind === 'done') post({ type: 'chat.done', requestId });
    }
  } catch (err) {
    if (controller.signal.aborted) {
      post({ type: 'chat.done', requestId });
      return;
    }
    post({ type: 'error', requestId, message: errorMessage(err) });
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
  if (!tab?.id) throw new Error('No active tab.');
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'getPageContext' });
  } catch {
    throw new Error('Cannot read this page (content script not available on this tab).');
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof HermesError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
