import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { onDeviceAvailable, onDevicePromptStream } from '../lib/builtinAI';
import {
  loadIndex,
  loadMessages,
  newConversationId,
  removeMessages,
  saveIndex,
  searchConversations,
  titleFrom,
  type ConversationMeta,
  type SearchHit,
  type StoredMessage,
} from '../lib/conversation';
import { downloadText, fileStem, toJson, toMarkdown } from '../lib/export';
import { sendRuntime } from '../lib/messaging';
import { takePendingNewChat, takePendingPrompt } from '../lib/pending';
import { startDictation, type Dictation } from '../lib/speech';
import {
  needsClipboard,
  needsPageContext,
  renderTemplate,
  varsFromContext,
  type PromptTemplate,
} from '../lib/templates';
import type {
  BackgroundToUi,
  ChatMessage,
  ChatMode,
  ContentPart,
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
 * The account whose conversations are currently loaded. Captured at load time
 * (not read from the settings store at save time) so persistence can never
 * write one account's history under another's key during an account switch.
 */
let conversationAccountId: string | null = null;
let convLoadToken = 0;
let searchToken = 0;
let dictation: Dictation | null = null;

export function getConversationAccountId(): string | null {
  return conversationAccountId;
}

export interface ChatState {
  messages: StoredMessage[];
  /** The account's conversation list, most recent first. */
  conversations: ConversationMeta[];
  /** Active conversation id; null = a draft chat not yet materialized. */
  conversationId: string | null;
  /** The active conversation's system prompt (sent ahead of the history). */
  system: string;
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
  /** Conversation-search query and results (null = not searching). */
  searchQuery: string;
  searchHits: SearchHit[] | null;
  /** Whether voice dictation is currently recording into the composer. */
  recording: boolean;
  /** Image data URLs staged to send with the next message (e.g. screenshots). */
  attachedImages: string[];

  setInput: (v: string) => void;
  setMode: (mode: ChatMode) => void;
  setModel: (model: string) => void;
  setAttachContext: (v: boolean) => void;
  setOnDevice: (v: boolean) => void;
  setAgentTools: (v: boolean) => void;
  setAutoApprove: (v: boolean) => void;
  setSystem: (v: string) => void;
  resolveConfirm: (approved: boolean) => void;
  sendMessage: (text: string) => void;
  /** Re-ask the last user message, replacing the answer below it. */
  regenerate: () => void;
  /** Remove one message from the conversation. */
  deleteMessage: (index: number) => void;
  /** Rewrite a past user message and re-ask from there (drops later turns). */
  editMessage: (index: number, text: string) => void;
  stop: () => void;
  /** Start a fresh draft chat (materialized on the first message). */
  newChat: () => void;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  /** Search this account's conversations by title + content. */
  setSearchQuery: (q: string) => void;
  /** Expand a quick-command template into the composer (fills runtime vars). */
  applyTemplate: (template: PromptTemplate) => Promise<void>;
  /** Start/stop voice dictation into the composer. */
  toggleVoice: () => void;
  /** Download a conversation as Markdown or JSON. */
  exportConversation: (id: string, format: 'md' | 'json') => Promise<void>;
  /** Capture the active tab and stage it as an attachment for the next message. */
  captureScreenshot: () => Promise<void>;
  /** Discard a staged attachment by index. */
  removeAttachment: (index: number) => void;
}

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({
    messages: [],
    conversations: [],
    conversationId: null,
    system: '',
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
    searchQuery: '',
    searchHits: null,
    recording: false,
    attachedImages: [],

    setInput: (input) => set({ input }),
    // Run mode and Agent tools are mutually exclusive (tools drive the chat
    // completions loop); enabling one visibly switches the other off.
    setMode: (mode) => set(mode === 'run' ? { mode, agentTools: false } : { mode }),
    setModel: (model) => set({ model }),
    setAttachContext: (attachContext) => set({ attachContext }),
    setOnDevice: (onDevice) => set({ onDevice }),
    setAgentTools: (agentTools) => set(agentTools ? { agentTools, mode: 'chat' } : { agentTools }),
    setAutoApprove: (autoApproveActions) => set({ autoApproveActions }),
    setSystem: (system) => {
      const { conversationId, conversations } = get();
      set({ system });
      if (conversationId) {
        set({ conversations: patchMeta(conversations, conversationId, { system }) });
        void persistIndex();
      }
    },
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

    regenerate: () => {
      const s = get();
      if (s.streaming) return;
      const lastUser = s.messages.map((m) => m.role).lastIndexOf('user');
      if (lastUser === -1) return;
      startStream(s.messages.slice(0, lastUser + 1));
    },

    deleteMessage: (index) => {
      if (get().streaming) return;
      set({ messages: get().messages.filter((_, i) => i !== index) });
    },

    editMessage: (index, text) => {
      const s = get();
      if (s.streaming) return;
      const target = s.messages[index];
      const clean = text.trim();
      if (!target || target.role !== 'user' || !clean) return;
      // Rewrite the user turn and re-ask from there, dropping everything below.
      const history: StoredMessage[] = [
        ...s.messages.slice(0, index),
        { role: 'user', content: clean },
      ];
      startStream(history);
    },

    stop: () => {
      odToken++; // cancel any on-device stream
      if (activeReq) sendPort({ type: 'cancel', requestId: activeReq });
      set({ streaming: false });
    },

    newChat: () => {
      if (get().streaming) get().stop();
      // A draft: no storage is touched until the first message materializes it.
      set({
        messages: [],
        conversationId: null,
        system: '',
        input: '',
        pendingConfirm: null,
        attachedImages: [],
      });
    },

    selectConversation: async (id) => {
      const s = get();
      if (id === s.conversationId) return;
      if (s.streaming) s.stop();
      const messages = await loadMessages(conversationAccountId, id);
      const meta = get().conversations.find((c) => c.id === id);
      set({ messages, conversationId: id, system: meta?.system ?? '', pendingConfirm: null });
      void persistIndex();
    },

    renameConversation: (id, title) => {
      const clean = title.trim();
      if (!clean) return;
      set({ conversations: patchMeta(get().conversations, id, { title: clean }) });
      void persistIndex();
    },

    deleteConversation: async (id) => {
      const s = get();
      await removeMessages(conversationAccountId, id);
      const conversations = s.conversations.filter((c) => c.id !== id);
      if (s.conversationId === id) {
        if (s.streaming) s.stop();
        set({
          conversations,
          conversationId: null,
          messages: [],
          system: '',
          pendingConfirm: null,
        });
      } else {
        set({ conversations });
      }
      void persistIndex();
    },

    setSearchQuery: (q) => {
      set({ searchQuery: q });
      const query = q.trim();
      if (!query) {
        set({ searchHits: null });
        return;
      }
      const token = ++searchToken;
      const index = { conversations: get().conversations, activeId: get().conversationId };
      void searchConversations(conversationAccountId, index, query).then((hits) => {
        if (token === searchToken) set({ searchHits: hits });
      });
    },

    applyTemplate: async (template) => {
      // Strip the "/name " the user typed; the remainder becomes {{input}}.
      const input = get().input.replace(/^\/\S*\s*/, '');
      let ctx: PageContext | null = null;
      if (needsPageContext(template.body)) {
        ctx = await sendRuntime<PageContext>({ type: 'getActivePageContext' }).catch(() => null);
      }
      const vars = varsFromContext(ctx, input);
      if (needsClipboard(template.body)) {
        vars.clipboard = await navigator.clipboard.readText().catch(() => '');
      }
      set({ input: renderTemplate(template.body, vars) });
    },

    toggleVoice: () => {
      if (dictation) {
        dictation.stop();
        return; // onEnd clears `recording` and the handle
      }
      dictation = startDictation(
        {
          onText: (text) => {
            const cur = useChatStore.getState().input;
            set({ input: cur ? `${cur} ${text}` : text });
          },
          onEnd: () => {
            dictation = null;
            set({ recording: false });
          },
        },
        navigator.language,
      );
      if (dictation) set({ recording: true });
    },

    exportConversation: async (id, format) => {
      const meta = get().conversations.find((c) => c.id === id);
      const messages =
        id === get().conversationId
          ? get().messages
          : await loadMessages(conversationAccountId, id);
      const json = format === 'json';
      downloadText(
        `${fileStem(meta?.title)}.${json ? 'json' : 'md'}`,
        json ? toJson(meta, messages) : toMarkdown(meta, messages),
        json ? 'application/json' : 'text/markdown',
      );
    },

    captureScreenshot: async () => {
      const dataUrl = await sendRuntime<string>({ type: 'captureScreenshot' });
      set({ attachedImages: [...get().attachedImages, dataUrl] });
    },

    removeAttachment: (index) => {
      set({ attachedImages: get().attachedImages.filter((_, i) => i !== index) });
    },
  })),
);

// ---------------------------------------------------------------------------
// Streaming + Port machinery (module-scoped; not part of the reactive state)
// ---------------------------------------------------------------------------

function patchMeta(
  conversations: ConversationMeta[],
  id: string,
  patch: Partial<ConversationMeta>,
): ConversationMeta[] {
  return conversations.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

/** Persist the conversation list + active id for the loaded account. */
async function persistIndex(): Promise<void> {
  const { conversations, conversationId } = useChatStore.getState();
  await saveIndex(conversationAccountId, { conversations, activeId: conversationId });
}

/** Append the user turn (materializing a draft conversation) and stream. */
function dispatch(content: string): void {
  const s = useChatStore.getState();
  if (!s.conversationId) {
    // First message of a draft: create the conversation, newest first.
    const meta: ConversationMeta = {
      id: newConversationId(),
      title: titleFrom(content),
      updatedAt: Date.now(),
      system: s.system || undefined,
    };
    useChatStore.setState({
      conversationId: meta.id,
      conversations: [meta, ...s.conversations],
    });
  } else {
    const touched = patchMeta(s.conversations, s.conversationId, { updatedAt: Date.now() });
    // Most-recent-first, like any chat list.
    touched.sort((a, b) => b.updatedAt - a.updatedAt);
    useChatStore.setState({ conversations: touched });
  }
  void persistIndex();
  const user: StoredMessage = { role: 'user', content };
  if (s.attachedImages.length > 0) user.images = s.attachedImages;
  useChatStore.setState({ attachedImages: [] }); // consumed by this turn
  startStream([...s.messages, user]);
}

/** Build the wire content for a turn: plain text, or multimodal parts + images. */
function toWireContent(m: StoredMessage): string | ContentPart[] {
  if (!m.images || m.images.length === 0) return m.content;
  const parts: ContentPart[] = m.content ? [{ type: 'text', text: m.content }] : [];
  for (const url of m.images) parts.push({ type: 'image_url', image_url: { url } });
  return parts;
}

/** Stream an answer for the given history (appends the assistant placeholder). */
function startStream(history: StoredMessage[]): void {
  const s = useChatStore.getState();
  const messages: StoredMessage[] = [...history, { role: 'assistant', content: '', tools: [] }];
  useChatStore.setState({ messages, input: '', streaming: true, pendingConfirm: null });

  // On-device answering applies only when tools aren't requested.
  if (s.onDevice && s.onDeviceSupported && !s.agentTools) {
    void runOnDevice(++odToken);
    return;
  }

  const requestId = nextId();
  activeReq = requestId;
  const payload: ChatMessage[] = history
    .filter((m) => m.role !== 'assistant' || m.content.length > 0)
    .map((m) => ({ role: m.role, content: toWireContent(m) }));
  if (s.system.trim()) payload.unshift({ role: 'system', content: s.system.trim() });
  sendPort({
    type: 'chat.start',
    requestId,
    model: s.model,
    useRun: s.mode === 'run',
    useTools: s.agentTools,
    autoApprove: s.autoApproveActions,
    messages: payload,
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

/** Load the active account's conversations, resetting any in-flight state.
 *  Called on startup and whenever the active account changes. */
export async function loadActiveConversation(): Promise<void> {
  const token = ++convLoadToken;
  useChatStore.getState().stop();
  const accountId = useSettingsStore.getState().activeId;
  const index = await loadIndex(accountId);
  const messages = await loadMessages(accountId, index.activeId);
  if (token !== convLoadToken) return; // superseded by a newer account switch
  conversationAccountId = accountId;
  const meta = index.conversations.find((c) => c.id === index.activeId);
  useChatStore.setState({
    messages,
    conversations: [...index.conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    conversationId: index.activeId,
    system: meta?.system ?? '',
    input: '',
    pendingConfirm: null,
    searchQuery: '',
    searchHits: null,
    attachedImages: [],
  });
}

async function detectOnDevice(): Promise<void> {
  useChatStore.setState({ onDeviceSupported: await onDeviceAvailable() });
}

async function runOnDevice(token: number): Promise<void> {
  const { messages, system } = useChatStore.getState();
  const lines = messages.filter((m) => m.content.length > 0).map((m) => `${m.role}: ${m.content}`);
  if (system.trim()) lines.unshift(`system: ${system.trim()}`);
  try {
    for await (const chunk of onDevicePromptStream(lines.join('\n'))) {
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
  if (p) applyPrompt(p.text, p.autoSend, p.append ?? false);
}

function applyPrompt(text: string, autoSend: boolean, append = false): void {
  // Quote-reply appends to the current composer; everything else replaces it.
  const input = append ? joinInput(useChatStore.getState().input, text) : text;
  useChatStore.setState({ input });
  if (autoSend) useChatStore.getState().sendMessage(input);
}

/** Append `addition` to `current`, separated by a blank line when both exist. */
export function joinInput(current: string, addition: string): string {
  return current.trim() ? `${current.replace(/\s+$/, '')}\n\n${addition}` : addition;
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
