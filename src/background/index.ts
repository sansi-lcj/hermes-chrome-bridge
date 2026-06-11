// Background service worker: the single owner of Hermes network access and the
// hub for Chrome-surface integrations (context menus, commands, omnibox,
// notifications).
//
// - Streams chat / run output to the side panel over a long-lived Port.
// - Runs started via the Runs API keep going even if the panel closes, and
//   raise a desktop notification when they finish.
// - Answers one-off discovery requests (models, skills, sessions, health).
// - Gathers page context from the active tab's content script.

import { ConfirmBroker } from '../lib/confirmBroker';
import { HermesClient } from '../lib/hermesClient';
import { setPendingNewChat, setPendingPrompt } from '../lib/pending';
import { addRun, listRuns, removeRun } from '../lib/runRegistry';
import { getSettings } from '../lib/storage';
import {
  isTasksKey,
  loadTasks,
  normalizeInterval,
  patchTask,
  taskAlarmName,
  taskIdFromAlarm,
} from '../lib/tasks';
import { createGuardedRunner, runTool, toolSpecs } from '../lib/tools';
import type {
  ApiRequest,
  ApiResponse,
  BackgroundToUi,
  ChatStartRequest,
  PageContext,
  PanelBroadcast,
  RunEvent,
  UiToBackground,
} from '../lib/types';

const PORT_NAME = 'hermes';
const MENU_ASK = 'hermes-ask-selection';
const MENU_QUOTE = 'hermes-quote-selection';
const MENU_SUMMARIZE = 'hermes-summarize-page';
/** Tool-call args shown in the progress trail are truncated to this length. */
const ARGS_PREVIEW_CHARS = 120;
/** Desktop notifications show at most this much of the Run's answer. */
const NOTIFY_SNIPPET_CHARS = 180;

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
      id: MENU_QUOTE,
      title: 'Quote “%s” in Hermes chat',
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

// Write-tool confirmations: resolves false on deny/timeout/abort/panel-close,
// so the tool loop can never park indefinitely. (Logic lives in confirmBroker
// so it is unit-testable.)
const confirms = new ConfirmBroker();

function requestConfirm(
  channel: Channel,
  requestId: string,
  tool: string,
  args: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (!channel.alive) return Promise.resolve(false);
  return confirms.request(
    (msg) => channel.post({ type: 'confirm', requestId, ...msg }),
    tool,
    args,
    signal,
  );
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

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
    if (msg.type === 'confirm.result') {
      confirms.resolve(msg.confirmId, msg.approved);
      return;
    }
    if (msg.type === 'chat.start') {
      const controller = new AbortController();
      active.set(msg.requestId, { controller, isRun: msg.useRun });
      void runStream(msg, controller, channel).finally(() => active.delete(msg.requestId));
    }
  });

  port.onDisconnect.addListener(() => {
    channel.alive = false; // future posts are dropped
    confirms.flush(); // nobody can answer them anymore
    // Cancel quick chat streams, but let long Runs finish in the background.
    for (const stream of active.values()) {
      if (!stream.isRun) stream.controller.abort();
    }
  });
});

/** Dispatch one chat request to the matching streaming strategy. */
async function runStream(
  req: ChatStartRequest,
  controller: AbortController,
  channel: Channel,
): Promise<void> {
  const hermes = await client();
  try {
    if (req.useTools) await streamWithTools(hermes, req, controller, channel);
    else if (req.useRun) await streamRun(hermes, req, controller, channel);
    else await streamChat(hermes, req, controller, channel);
  } catch (err) {
    if (controller.signal.aborted) {
      channel.post({ type: 'chat.done', requestId: req.requestId });
      return;
    }
    channel.post({ type: 'error', requestId: req.requestId, message: errorMessage(err) });
  }
}

/** Tool-use loop: the agent calls browser tools until it answers. */
async function streamWithTools(
  hermes: HermesClient,
  req: ChatStartRequest,
  controller: AbortController,
  channel: Channel,
): Promise<void> {
  const { requestId, messages, model, autoApprove } = req;
  const guardedRun = createGuardedRunner(
    runTool,
    (tool, args) => requestConfirm(channel, requestId, tool, args, controller.signal),
    autoApprove,
  );
  for await (const ev of hermes.runToolLoop(
    messages,
    model,
    toolSpecs(),
    guardedRun,
    controller.signal,
  )) {
    if (ev.kind === 'tool-call')
      channel.post({
        type: 'chat.tool',
        requestId,
        progress: {
          name: ev.name,
          message: `calling ${ev.name}(${ev.args.slice(0, ARGS_PREVIEW_CHARS)})`,
        },
      });
    else if (ev.kind === 'tool-result')
      channel.post({ type: 'chat.tool', requestId, progress: { name: ev.name, status: 'done' } });
    else if (ev.kind === 'final')
      channel.post({ type: 'chat.delta', requestId, content: ev.content });
  }
  channel.post({ type: 'chat.done', requestId });
}

/** Long task via the Runs API; survives panel close and notifies on finish. */
async function streamRun(
  hermes: HermesClient,
  req: ChatStartRequest,
  controller: AbortController,
  channel: Channel,
): Promise<void> {
  const { requestId, messages, model } = req;
  const run = await hermes.createRun(messages, model);
  await addRun(run.id, model); // survive a service-worker restart
  try {
    channel.post({ type: 'chat.tool', requestId, progress: { message: `Run started: ${run.id}` } });
    controller.signal.addEventListener('abort', () => void hermes.stopRun(run.id));

    const answer = await pumpRunEvents(hermes, run.id, controller.signal, (text, ev) => {
      if (text) channel.post({ type: 'chat.delta', requestId, content: text });
      else
        channel.post({ type: 'chat.tool', requestId, progress: { message: ev.event ?? 'event' } });
    });
    channel.post({ type: 'chat.done', requestId });
    // If the panel closed mid-run, ping the user that it finished.
    if (!channel.alive) notifyRunDone(answer);
  } finally {
    await removeRun(run.id);
  }
}

/** Plain streaming chat completion. */
async function streamChat(
  hermes: HermesClient,
  req: ChatStartRequest,
  controller: AbortController,
  channel: Channel,
): Promise<void> {
  const { requestId, messages, model } = req;
  for await (const ev of hermes.chatStream(messages, model, controller.signal)) {
    if (ev.kind === 'delta') channel.post({ type: 'chat.delta', requestId, content: ev.content });
    else if (ev.kind === 'tool')
      channel.post({ type: 'chat.tool', requestId, progress: ev.progress });
    else if (ev.kind === 'done') channel.post({ type: 'chat.done', requestId });
  }
}

/**
 * Consume a Run's event stream, accumulating its text. Shared by live streaming
 * (with a per-event callback) and orphan resumption (without).
 */
async function pumpRunEvents(
  hermes: HermesClient,
  runId: string,
  signal: AbortSignal,
  onEvent: (text: string | undefined, ev: RunEvent) => void = () => {},
): Promise<string> {
  let answer = '';
  for await (const ev of hermes.runEvents(runId, signal)) {
    const text = extractRunText(ev.data);
    if (text) answer += text;
    onEvent(text, ev);
  }
  return answer;
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

// chrome.sidePanel.open() must run synchronously within the user gesture —
// awaiting anything first can consume the gesture and make it throw. Handlers
// without a tab (omnibox, notification click) use this tracked window id.
let focusedWindowId: number | undefined;
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) focusedWindowId = windowId;
});
void chrome.windows.getLastFocused().then((win) => {
  if (focusedWindowId == null && win?.id != null) focusedWindowId = win.id;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  openPanelSync(tab?.windowId);
  void (async () => {
    if (info.menuItemId === MENU_ASK && info.selectionText) {
      await deliverPrompt(`About this text:\n\n"""\n${info.selectionText}\n"""\n`, false);
    } else if (info.menuItemId === MENU_QUOTE && info.selectionText) {
      // Append the selection as a Markdown quote to the current composer.
      const quote = info.selectionText
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      await deliverPrompt(`${quote}\n\n`, false, true);
    } else if (info.menuItemId === MENU_SUMMARIZE) {
      const ctx = await readPageContext(tab?.id).catch(() => null);
      const body = ctx ? `${ctx.title}\n${ctx.url}\n\n${ctx.text}` : '';
      await deliverPrompt(`Summarize this page:\n\n${body}`, true);
    }
  })();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open-panel') {
    openPanelSync(tab?.windowId);
  } else if (command === 'new-chat') {
    openPanelSync(tab?.windowId);
    void deliverNewChat();
  }
});

chrome.omnibox.onInputEntered.addListener((text) => {
  const query = text.trim();
  if (!query) return;
  openPanelSync();
  void deliverPrompt(query, true);
});

chrome.omnibox.setDefaultSuggestion({
  description: 'Ask the Hermes Agent: type your question and press Enter',
});

/**
 * Persist a prompt and poke any open panel to consume it. The panel always
 * reads the prompt from storage (single source of truth, consumed once), so it
 * is applied exactly once whether the panel was already open or opens fresh.
 */
async function deliverPrompt(text: string, autoSend: boolean, append = false): Promise<void> {
  await setPendingPrompt({ text, autoSend, append });
  broadcast({ type: 'pendingPrompt' });
}

/** Persist a new-chat request and poke any open panel (same pattern as above). */
async function deliverNewChat(): Promise<void> {
  await setPendingNewChat();
  broadcast({ type: 'newChat' });
}

/** Open the side panel synchronously within a user gesture (best-effort). */
function openPanelSync(windowId: number | undefined = focusedWindowId): void {
  if (windowId == null) return;
  chrome.sidePanel.open({ windowId }).catch((err) => console.warn('sidePanel.open failed', err));
}

function broadcast(msg: PanelBroadcast): void {
  // Best-effort; ignored if no panel is listening.
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

function notifyRunDone(answer: string): void {
  const snippet = answer.trim().slice(0, NOTIFY_SNIPPET_CHARS) || 'Your task finished.';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Hermes finished a task',
    message: snippet,
    priority: 1,
  });
}

chrome.notifications.onClicked.addListener(() => openPanelSync());

// ---------------------------------------------------------------------------
// Resume Runs orphaned by a service-worker restart
// ---------------------------------------------------------------------------

/** On startup, reconnect to any Run left in the registry and notify on finish. */
async function resumeOrphanedRuns(): Promise<void> {
  const runs = await listRuns();
  const ids = Object.keys(runs);
  if (ids.length === 0) return;
  const hermes = await client();
  for (const runId of ids) void resumeRun(hermes, runId);
}

async function resumeRun(hermes: HermesClient, runId: string): Promise<void> {
  try {
    notifyRunDone(await pumpRunEvents(hermes, runId, new AbortController().signal));
  } catch {
    /* run gone or unreachable — drop it */
  } finally {
    await removeRun(runId);
  }
}

// Runs once per worker startup (a fresh instance has no in-memory streams).
void resumeOrphanedRuns();

// ---------------------------------------------------------------------------
// Scheduled tasks (digests / monitoring) backed by chrome.alarms
// ---------------------------------------------------------------------------

const NOTIFY_RESULT_CHARS = 250;

/** Reconcile chrome.alarms with the persisted task registry. */
async function syncTaskAlarms(): Promise<void> {
  const tasks = await loadTasks();
  const wanted = new Set(tasks.filter((t) => t.enabled).map((t) => t.id));
  const existing = await chrome.alarms.getAll();
  for (const a of existing) {
    const id = taskIdFromAlarm(a.name);
    if (id && !wanted.has(id)) await chrome.alarms.clear(a.name);
  }
  for (const t of tasks) {
    if (!t.enabled) continue;
    const minutes = normalizeInterval(t.intervalMinutes);
    chrome.alarms.create(taskAlarmName(t.id), {
      periodInMinutes: minutes,
      delayInMinutes: minutes,
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  const id = taskIdFromAlarm(alarm.name);
  if (id) void runScheduledTask(id);
});

// Re-sync alarms whenever the task registry changes (e.g. edited in the panel).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(isTasksKey)) void syncTaskAlarms();
});

async function runScheduledTask(id: string): Promise<void> {
  const task = (await loadTasks()).find((t) => t.id === id);
  if (!task || !task.enabled) return;
  try {
    const hermes = await client();
    const settings = await getSettings();
    const res = await hermes.chatCompletion(
      [{ role: 'user', content: task.prompt }],
      settings.defaultModel,
      undefined,
      new AbortController().signal,
    );
    const answer = (res.choices?.[0]?.message?.content ?? '').toString();
    await patchTask(id, { lastRunAt: Date.now(), lastResult: answer.slice(0, 2000) });
    notifyTaskDone(task.name, answer);
  } catch (err) {
    await patchTask(id, { lastRunAt: Date.now(), lastResult: `⚠️ ${errorMessage(err)}` });
  }
}

function notifyTaskDone(name: string, answer: string): void {
  const snippet = answer.trim().slice(0, NOTIFY_RESULT_CHARS) || 'Task finished.';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: `Hermes: ${name}`,
    message: snippet,
    priority: 1,
  });
}

// Reconcile alarms on every worker startup.
void syncTaskAlarms();

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
  if (message?.type === 'captureScreenshot') {
    captureVisibleTab()
      .then((dataUrl) => sendResponse({ ok: true, data: dataUrl }))
      .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
    return true;
  }
  return false;
});

/** Capture the active tab as a PNG data URL (for screenshot Q&A). */
async function captureVisibleTab(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId == null) throw new Error('No active tab to capture.');
  try {
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (err) {
    throw new Error(`Could not capture this page (${String(err)}).`);
  }
}

async function handleApi(req: ApiRequest): Promise<unknown> {
  // An explicit settings payload (e.g. Test connection on an unsaved form
  // draft) overrides the active account's saved connection.
  const hermes = new HermesClient(req.settings ?? (await getSettings()));
  switch (req.action) {
    case 'testConnection': {
      try {
        await hermes.health();
      } catch {
        /* older servers lack /v1/health — the models call below still verifies */
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
  return err instanceof Error ? err.message : String(err);
}
