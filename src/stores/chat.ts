import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { onDeviceAvailable, onDevicePromptStream } from '../lib/builtinAI';
import { clearConversation, loadConversation, type StoredMessage } from '../lib/conversation';
import { sendRuntime } from '../lib/messaging';
import { takePendingPrompt } from '../lib/pending';
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

let counter = 0;
const nextId = () => `req-${Date.now()}-${counter++}`;

// Non-reactive internals (the Chrome Port is not UI state).
let port: chrome.runtime.Port | null = null;
let activeReq: string | null = null;
let odToken = 0;

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
  /** Let the agent call browser tools (list tabs, read page, open url). */
  agentTools: boolean;

  setInput: (v: string) => void;
  setMode: (mode: ChatMode) => void;
  setModel: (model: string) => void;
  setAttachContext: (v: boolean) => void;
  setOnDevice: (v: boolean) => void;
  setAgentTools: (v: boolean) => void;
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

    setInput: (input) => set({ input }),
    setMode: (mode) => set({ mode }),
    setModel: (model) => set({ model }),
    setAttachContext: (attachContext) => set({ attachContext }),
    setOnDevice: (onDevice) => set({ onDevice }),
    setAgentTools: (agentTools) => set({ agentTools }),

    sendMessage: (text) => {
      const trimmed = text.trim();
      if (!trimmed || get().streaming) return;
      if (get().attachContext) {
        sendRuntime<PageContext>({ type: 'getActivePageContext' })
          .then((ctx) => dispatch(`${trimmed}\n\n${formatContext(ctx)}`))
          .catch(() => dispatch(trimmed));
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
      set({ messages: [] });
      void clearConversation();
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
  useChatStore.setState({ messages, input: '', streaming: true });

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
    useChatStore.setState({ streaming: false });
    activeReq = null;
  }
}

function connect(): void {
  port = chrome.runtime.connect({ name: 'hermes' });
  port.onMessage.addListener((msg: BackgroundToUi) => onPortMessage(msg));
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 250);
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

async function restore(): Promise<void> {
  useChatStore.setState({ messages: await loadConversation() });
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

async function consumePending(): Promise<void> {
  const p = await takePendingPrompt();
  if (p) applyPrompt(p.text, p.autoSend);
}

function applyPrompt(text: string, autoSend: boolean): void {
  useChatStore.setState({ input: text });
  if (autoSend) useChatStore.getState().sendMessage(text);
}

function onBroadcast(msg: PanelBroadcast): void {
  if (msg.type === 'pendingPrompt') void consumePending();
  else if (msg.type === 'newChat') useChatStore.getState().newChat();
}

/** Wire side effects: Port, persisted history, on-device detection, prompts. */
export function initChat(): void {
  connect();
  void restore();
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
