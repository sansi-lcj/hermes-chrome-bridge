import {
  action,
  autorun,
  computed,
  makeObservable,
  observable,
  reaction,
  runInAction,
  toJS,
} from 'mobx';
import {
  clearConversation,
  loadConversation,
  saveConversation,
  type StoredMessage,
} from '../lib/conversation';
import { onDeviceAvailable, onDevicePromptStream } from '../lib/builtinAI';
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
import type { SettingsStore } from './SettingsStore';

let counter = 0;
const nextId = () => `req-${Date.now()}-${counter++}`;

/**
 * Owns the conversation, the long-lived Port to the background worker, and the
 * streaming lifecycle. Components observe it; they never touch Chrome APIs.
 */
export class ChatStore {
  messages: StoredMessage[] = [];
  input = '';
  mode: ChatMode = 'chat';
  model = '';
  models: ModelInfo[] = [];
  attachContext = false;
  streaming = false;
  /** Whether to answer with Chrome's on-device model instead of Hermes. */
  onDevice = false;
  /** Whether the on-device model is available on this machine. */
  onDeviceSupported = false;

  // Non-observable internals (a Chrome Port must not be proxied by MobX).
  private port: chrome.runtime.Port | null = null;
  private activeReq: string | null = null;
  /** Bumped to cancel an in-flight on-device stream. */
  private odToken = 0;

  constructor(private settings: SettingsStore) {
    makeObservable(
      this,
      {
        messages: observable,
        input: observable,
        mode: observable,
        model: observable,
        models: observable,
        attachContext: observable,
        streaming: observable,
        onDevice: observable,
        onDeviceSupported: observable,
        modelOptions: computed,
        canSend: computed,
        setInput: action,
        setMode: action,
        setModel: action,
        setAttachContext: action,
        setOnDevice: action,
        detectOnDevice: action,
        runOnDevice: action,
        syncDefaults: action,
        loadModels: action,
        restore: action,
        onPortMessage: action,
        sendMessage: action,
        dispatch: action,
        stop: action,
        newChat: action,
        consumePending: action,
        apply: action,
        onBroadcast: action,
      },
      { autoBind: true },
    );

    this.model = settings.defaultModel;
    this.mode = settings.mode;
    // Keep defaults in sync with settings; reload models when the server changes.
    reaction(
      () => [settings.defaultModel, settings.mode] as const,
      () => this.syncDefaults(),
    );
    reaction(
      () => [settings.baseUrl, settings.apiKey] as const,
      () => void this.loadModels(),
      {
        fireImmediately: true,
      },
    );

    void this.restore();
    void this.detectOnDevice();
    this.connect();

    void this.consumePending();
    chrome.runtime.onMessage.addListener(this.onBroadcast);

    // Persist whenever a turn completes (skip mid-stream churn).
    autorun(() => {
      if (!this.streaming && this.messages.length > 0) void saveConversation(toJS(this.messages));
    });
  }

  // ----- derived -----------------------------------------------------------

  get modelOptions(): { value: string; label: string }[] {
    const ids = new Set(this.models.map((m) => m.id));
    if (this.model) ids.add(this.model);
    return [...ids].map((id) => ({ value: id, label: id }));
  }

  get canSend(): boolean {
    return this.input.trim().length > 0 && !this.streaming;
  }

  // ----- simple setters (actions) ------------------------------------------

  setInput(v: string) {
    this.input = v;
  }
  setMode(mode: ChatMode) {
    this.mode = mode;
  }
  setModel(model: string) {
    this.model = model;
  }
  setAttachContext(v: boolean) {
    this.attachContext = v;
  }
  setOnDevice(v: boolean) {
    this.onDevice = v;
  }

  async detectOnDevice() {
    const ok = await onDeviceAvailable();
    runInAction(() => {
      this.onDeviceSupported = ok;
    });
  }

  syncDefaults() {
    this.model = this.settings.defaultModel;
    this.mode = this.settings.mode;
  }

  // ----- data loading ------------------------------------------------------

  async loadModels() {
    try {
      const models = await sendRuntime<ModelInfo[]>({ type: 'api', action: 'models' });
      runInAction(() => {
        this.models = models;
      });
    } catch {
      runInAction(() => {
        this.models = [];
      });
    }
  }

  async restore() {
    const msgs = await loadConversation();
    runInAction(() => {
      this.messages = msgs;
    });
  }

  // ----- Port lifecycle ----------------------------------------------------

  private connect() {
    const port = chrome.runtime.connect({ name: 'hermes' });
    port.onMessage.addListener((msg: BackgroundToUi) => this.onPortMessage(msg));
    port.onDisconnect.addListener(() => {
      this.port = null;
      setTimeout(() => this.connect(), 250);
    });
    this.port = port;
  }

  private send(msg: UiToBackground) {
    if (!this.port) this.connect();
    this.port?.postMessage(msg);
  }

  onPortMessage(msg: BackgroundToUi) {
    if (msg.requestId !== this.activeReq) return;
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant') {
      if (msg.type === 'chat.delta') last.content += msg.content;
      else if (msg.type === 'chat.tool')
        last.tools = [...(last.tools ?? []), formatTool(msg.progress)];
      else if (msg.type === 'error') last.content += `\n\n> ⚠️ ${msg.message}`;
    }
    if (msg.type === 'chat.done' || msg.type === 'error') {
      this.streaming = false;
      this.activeReq = null;
    }
  }

  // ----- sending -----------------------------------------------------------

  sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || this.streaming) return;
    if (this.attachContext) {
      sendRuntime<PageContext>({ type: 'getActivePageContext' })
        .then((ctx) => this.dispatch(`${trimmed}\n\n${formatContext(ctx)}`))
        .catch(() => this.dispatch(trimmed));
    } else {
      this.dispatch(trimmed);
    }
  }

  dispatch(content: string) {
    this.messages.push({ role: 'user', content });
    this.messages.push({ role: 'assistant', content: '', tools: [] });
    this.input = '';
    this.streaming = true;

    if (this.onDevice && this.onDeviceSupported) {
      void this.runOnDevice(++this.odToken);
      return;
    }

    const requestId = nextId();
    this.activeReq = requestId;
    this.send({
      type: 'chat.start',
      requestId,
      model: this.model,
      useRun: this.mode === 'run',
      messages: this.messages
        .filter((m) => m.role !== 'assistant' || m.content.length > 0)
        .map((m) => ({ role: m.role, content: m.content })),
    });
  }

  /** Stream an answer from Chrome's on-device model into the last bubble. */
  async runOnDevice(token: number) {
    const transcript = this.messages
      .filter((m) => m.content.length > 0)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    try {
      for await (const chunk of onDevicePromptStream(transcript)) {
        if (token !== this.odToken) break; // cancelled
        runInAction(() => {
          const last = this.messages[this.messages.length - 1];
          if (last && last.role === 'assistant') last.content += chunk;
        });
      }
    } catch (e) {
      runInAction(() => {
        const last = this.messages[this.messages.length - 1];
        if (last && last.role === 'assistant') last.content += `\n\n> ⚠️ ${String(e)}`;
      });
    } finally {
      runInAction(() => {
        if (token === this.odToken) this.streaming = false;
      });
    }
  }

  stop() {
    this.odToken++; // cancel any on-device stream
    if (this.activeReq) this.send({ type: 'cancel', requestId: this.activeReq });
    this.streaming = false;
  }

  newChat() {
    if (this.streaming) this.stop();
    this.messages = [];
    void clearConversation();
  }

  // ----- pending prompts (context menu / omnibox / command) ----------------

  async consumePending() {
    const p = await takePendingPrompt();
    if (p) this.apply(p.text, p.autoSend);
  }

  apply(text: string, autoSend: boolean) {
    this.input = text;
    if (autoSend) this.sendMessage(text);
  }

  onBroadcast(msg: PanelBroadcast) {
    if (msg.type === 'pendingPrompt') void this.consumePending();
    else if (msg.type === 'newChat') this.newChat();
  }
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
