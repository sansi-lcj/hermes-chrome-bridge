import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { onDeviceAvailable, onDevicePromptStream } from '../lib/builtinAI';
import { clearConversation, loadConversation, type StoredMessage } from '../lib/conversation';
import { sendRuntime } from '../lib/messaging';
import { takePendingNewChat, takePendingPrompt } from '../lib/pending';
import type {
  BackgroundToUi,
  ChatMode,
  ModelInfo,
  PageContext,
  PanelBroadcast,
  ToolProgressEvent,
  UiToBackground,
} from '../lib/types';
import { useSettingsStore } from './settings';

const nextId = () => `req-${crypto.randomUUID()}`;

// Non-reactive internals (the Chrome Port is not UI state).
let port: chrome.runtime.Port | null = null;
let activeReq: string | null = null;
let odToken = 0;
/** Guards the async page-context fetch so a double-submit can't dispatch twice. */
let sendInFlight = false;
/**
 * The account whose conversation is currently in `messages`. Captured at load
 * time (not read from the settings store at save time) so persistence can never
 * write one account's history under another's key during an account switch.
 */
let conversationAccountId: string | null = null;
let convLoadToken = 0;

export function getConversationAccountId(): string | null {
  return conversationAccountId;
}

interface ChatState {
  messages: StoredMessage[];
  input: string;
  mode: ChatMode;
  model: string;
  models: ModelInfo[];
  attachContext: boolean;
  streaming: boolean;
  onDevice: boolean;
  onDeviceSupported: boolean;
  /** Let the agent call browser tools (list tabs, read page, click, type, …). */
  agentTools: boolean;
  /** Run write/action tools without asking each time. */
  autoApproveActions: boolean;
  /** A pending write-tool confirmation awaiting the user's decision. */
  pendingConfirm: { confirmId: string; tool: string; args: string } | null;

  setInput: (v: string) => void;
  setMode: (mode: ChatMode) => void;
  setModel: (model: string) => void;
  setAttachContext: (v: boolean) => void;
  setOnDevice: (v: boolean) => void;
  setAgentTools: (v: boolean) => void;
  setAutoApprove: (v: boolean) => void;
  resolveConfirm: (approved: boolean) => void;
  sendMessage: (text: string) => void;
  stop: () => void;
  newChat: () => void;
}

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({
    messages: [],
    input: '',
    mode: useSettingsStore.getState().mode,
    model: useSettingsStore.getState().defaultModel,
    models: [],
    attachContext: false,
    streaming: false,
    onDevice: false,
    onDeviceSupported: false,
    agentTools: false,
    autoApproveActions: false,
    pendingConfirm: null,

    setInput: (input) => set({ input }),
    // Run mode and Agent tools are mutually exclusive (tools drive the chat
    // completions loop); enabling one visibly switches the other off.
    setMode: (mode) => set(mode === 'run' ? { mode, agentTools: false } : { mode }),
    setModel: (model) => set({ model }),
    setAttachContext: (attachContext) => set({ attachContext }),
    setOnDevice: (onDevice) => set({ onDevice }),
    setAgentTools: (agentTools) => set(agentTools ? { agentTools, mode: 'chat' } : { agentTools }),
    setAutoApprove: (autoApproveActions) => set({ autoApproveActions }),
    resolveConfirm: (approved) => {
      const pc = get().pendingConfirm;
      if (!pc) return;
      sendPort({ type: 'confirm.result', confirmId: pc.confirmId, approved });
      set({ pendingConfirm: null });
    },

    sendMessage: (text) => {
      const trimmed = text.trim();
      if (!trimmed || get().streaming || sendInFlight) return;
      if (get().attachContext) {
        sendInFlight = true; // block a second submit while the context fetch is in flight
        sendRuntime<PageContext>({ type: 'getActivePageContext' })
          .then((ctx) => dispatch(`${trimmed}\n\n${formatContext(ctx)}`))
          .catch(() => dispatch(trimmed))
          .finally(() => {
            sendInFlight = false;
          });
      } else {
        dispatch(trimmed);
      }
    },

    stop: () => {
      odToken++; // cancel any on-device stream
      if (activeReq) sendPort({ type: 'cancel', requestId: activeReq });
      set({ streaming: false });
    },

    newChat: () => {
      if (get().streaming) get().stop();
      set({ messages: [], pendingConfirm: null });
      void clearConversation(conversationAccountId);
    },
  })),
);

// ---------------------------------------------------------------------------
// Streaming + Port machinery (module-scoped; not part of the reactive state)
// ---------------------------------------------------------------------------

function dispatch(content: string): void {
  const s = useChatStore.getState();
  const messages: StoredMessage[] = [
    ...s.messages,
    { role: 'user', content },
    { role: 'assistant', content: '', tools: [] },
  ];
  useChatStore.setState({ messages, input: '', streaming: true, pendingConfirm: null });

  // On-device answering applies only when tools aren't requested.
  if (s.onDevice && s.onDeviceSupported && !s.agentTools) {
    void runOnDevice(++odToken);
    return;
  }

  const requestId = nextId();
  activeReq = requestId;
  sendPort({
    type: 'chat.start',
    requestId,
    model: s.model,
    useRun: s.mode === 'run',
    useTools: s.agentTools,
    autoApprove: s.autoApproveActions,
    messages: messages
      .filter((m) => m.role !== 'assistant' || m.content.length > 0)
      .map((m) => ({ role: m.role, content: m.content })),
  });
}

function patchLastAssistant(fn: (last: StoredMessage) => StoredMessage): void {
  const { messages } = useChatStore.getState();
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return;
  useChatStore.setState({ messages: [...messages.slice(0, -1), fn(last)] });
}

export function onPortMessage(msg: BackgroundToUi): void {
  if (msg.requestId !== activeReq) return;
  if (msg.type === 'confirm') {
    useChatStore.setState({
      pendingConfirm: { confirmId: msg.confirmId, tool: msg.tool, args: msg.args },
    });
    return;
  }
  if (msg.type === 'chat.delta')
    patchLastAssistant((last) => ({ ...last, content: last.content + msg.content }));
  else if (msg.type === 'chat.tool')
    patchLastAssistant((last) => ({
      ...last,
      tools: [...(last.tools ?? []), formatTool(msg.progress)],
    }));
  else if (msg.type === 'error')
    patchLastAssistant((last) => ({ ...last, content: last.content + `\n\n> ⚠️ ${msg.message}` }));

  if (msg.type === 'chat.done' || msg.type === 'error') {
    useChatStore.setState({ streaming: false, pendingConfirm: null });
    activeReq = null;
  }
}

const RECONNECT_BASE_MS = 250;
const RECONNECT_MAX_MS = 5_000;
let reconnectDelay = RECONNECT_BASE_MS;

function connect(): void {
  port = chrome.runtime.connect({ name: 'hermes' });
  port.onMessage.addListener((msg: BackgroundToUi) => {
    reconnectDelay = RECONNECT_BASE_MS; // traffic means the link is healthy
    onPortMessage(msg);
  });
  port.onDisconnect.addListener(() => {
    port = null;
    // The background aborts our in-flight stream when the port drops (e.g. the
    // MV3 worker was recycled), so no chat.done will ever arrive — surface the
    // interruption instead of spinning forever.
    if (activeReq) {
      activeReq = null;
      patchLastAssistant((last) => ({
        ...last,
        content: last.content + '\n\n> ⚠️ Connection lost — response interrupted.',
      }));
      useChatStore.setState({ streaming: false, pendingConfirm: null });
    }
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS); // back off
  });
}

function sendPort(msg: UiToBackground): void {
  if (!port) connect();
  port?.postMessage(msg);
}

export async function loadModels(): Promise<void> {
  try {
    const models = await sendRuntime<ModelInfo[]>({ type: 'api', action: 'models' });
    useChatStore.setState({ models });
  } catch {
    useChatStore.setState({ models: [] });
  }
}

/** Load the active account's conversation, resetting any in-flight state.
 *  Called on startup and whenever the active account changes. */
export async function loadActiveConversation(): Promise<void> {
  const token = ++convLoadToken;
  useChatStore.getState().stop();
  const accountId = useSettingsStore.getState().activeId;
  const messages = await loadConversation(accountId);
  if (token !== convLoadToken) return; // superseded by a newer account switch
  conversationAccountId = accountId;
  useChatStore.setState({ messages, input: '', pendingConfirm: null });
}

async function detectOnDevice(): Promise<void> {
  useChatStore.setState({ onDeviceSupported: await onDeviceAvailable() });
}

async function runOnDevice(token: number): Promise<void> {
  const transcript = useChatStore
    .getState()
    .messages.filter((m) => m.content.length > 0)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
  try {
    for await (const chunk of onDevicePromptStream(transcript)) {
      if (token !== odToken) break; // cancelled
      patchLastAssistant((last) => ({ ...last, content: last.content + chunk }));
    }
  } catch (e) {
    patchLastAssistant((last) => ({ ...last, content: last.content + `\n\n> ⚠️ ${String(e)}` }));
  } finally {
    if (token === odToken) useChatStore.setState({ streaming: false });
  }
}

/** Consume any pending panel actions (stored once, applied exactly once). */
async function consumePending(): Promise<void> {
  if (await takePendingNewChat()) useChatStore.getState().newChat();
  const p = await takePendingPrompt();
  if (p) applyPrompt(p.text, p.autoSend);
}

function applyPrompt(text: string, autoSend: boolean): void {
  useChatStore.setState({ input: text });
  if (autoSend) useChatStore.getState().sendMessage(text);
}

function onBroadcast(msg: PanelBroadcast): void {
  // Both broadcasts are data-less pokes; the action itself lives in storage so
  // it also reaches a panel that had to open first (and applies exactly once).
  if (msg.type === 'pendingPrompt' || msg.type === 'newChat') void consumePending();
}

/** Wire side effects: Port, persisted history, on-device detection, prompts. */
export function initChat(): void {
  connect();
  // The active account's conversation is loaded by the activeId subscription in
  // stores/index once accounts have loaded.
  void detectOnDevice();
  void consumePending();
  chrome.runtime.onMessage.addListener(onBroadcast);
}

function formatTool(p: ToolProgressEvent): string {
  return [p.name, p.status, p.message].filter(Boolean).join(' — ') || 'tool step';
}

function formatContext(ctx: PageContext): string {
  const body = ctx.selection || ctx.text;
  return `[Page context]\nTitle: ${ctx.title}\nURL: ${ctx.url}\n${
    ctx.selection ? 'Selection' : 'Content'
  }:\n${body}`;
}
