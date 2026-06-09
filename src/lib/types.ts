// Shared types for the Hermes Chrome Bridge extension.
//
// Covers (a) the subset of the Hermes Agent OpenAI-compatible HTTP API we use,
// and (b) the internal message protocol exchanged between the side-panel UI and
// the background service worker over a long-lived chrome.runtime Port.

// ---------------------------------------------------------------------------
// Settings (persisted in chrome.storage.local)
// ---------------------------------------------------------------------------

export type ChatMode = 'chat' | 'run';

export interface Settings {
  /** Base URL of the Hermes API server, e.g. "http://127.0.0.1:8642". No trailing slash. */
  baseUrl: string;
  /** Bearer token (API_SERVER_KEY). */
  apiKey: string;
  /** Default model / agent name sent with requests. */
  defaultModel: string;
  /** Default interaction mode. */
  mode: ChatMode;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://127.0.0.1:8642',
  apiKey: '',
  defaultModel: 'hermes',
  mode: 'chat',
};

// ---------------------------------------------------------------------------
// Hermes / OpenAI-compatible API shapes
// ---------------------------------------------------------------------------

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present on assistant turns that request tools. */
  tool_calls?: ToolCall[];
  /** Links a tool result back to the assistant's tool call. */
  tool_call_id?: string;
}

/** OpenAI "function" tool spec advertised to the model. */
export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  tools?: ToolSpec[];
}

export interface ChatCompletionResponse {
  choices: Array<{
    index: number;
    message: { role: ChatRole; content: string | null; tool_calls?: ToolCall[] };
    finish_reason: string | null;
  }>;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: ChatRole; content?: string };
    finish_reason: string | null;
  }>;
}

/** Custom SSE event Hermes emits to surface tool execution progress. */
export interface ToolProgressEvent {
  /** Tool / skill name. */
  name?: string;
  /** Free-form human-readable status. */
  message?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ModelInfo {
  id: string;
  object?: string;
  owned_by?: string;
}

export interface ModelsResponse {
  object?: string;
  data: ModelInfo[];
}

export interface Skill {
  id?: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface Toolset {
  id?: string;
  name: string;
  description?: string;
  tools?: string[];
  [key: string]: unknown;
}

export interface SessionInfo {
  id: string;
  title?: string;
  created_at?: string | number;
  updated_at?: string | number;
  message_count?: number;
  [key: string]: unknown;
}

export interface RunInfo {
  id: string;
  status: string;
  [key: string]: unknown;
}

/** Generic SSE frame parsed from a Runs `/events` stream. */
export interface RunEvent {
  event?: string;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Page context (gathered by the content script)
// ---------------------------------------------------------------------------

export interface PageContext {
  url: string;
  title: string;
  selection: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Port message protocol: UI -> background
// ---------------------------------------------------------------------------

export interface ChatStartRequest {
  type: 'chat.start';
  /** Correlates streamed responses to this request. */
  requestId: string;
  messages: ChatMessage[];
  model: string;
  /** When true, run via the Runs API instead of chat completions. */
  useRun: boolean;
  /** When true, let the agent call browser tools (tool-use loop). */
  useTools: boolean;
}

export interface CancelRequest {
  type: 'cancel';
  requestId: string;
}

export type UiToBackground = ChatStartRequest | CancelRequest;

// ---------------------------------------------------------------------------
// Port message protocol: background -> UI
// ---------------------------------------------------------------------------

export interface ChatDeltaMessage {
  type: 'chat.delta';
  requestId: string;
  content: string;
}

export interface ToolProgressMessage {
  type: 'chat.tool';
  requestId: string;
  progress: ToolProgressEvent;
}

export interface ChatDoneMessage {
  type: 'chat.done';
  requestId: string;
}

export interface ErrorMessage {
  type: 'error';
  requestId: string;
  message: string;
}

export type BackgroundToUi =
  | ChatDeltaMessage
  | ToolProgressMessage
  | ChatDoneMessage
  | ErrorMessage;

// ---------------------------------------------------------------------------
// One-off runtime messages (request/response via chrome.runtime.sendMessage)
// ---------------------------------------------------------------------------

export interface GetPageContextMessage {
  type: 'getPageContext';
}

export type ContentScriptMessage = GetPageContextMessage;

// ---------------------------------------------------------------------------
// Discovery / connection requests (chrome.runtime.sendMessage -> background)
// ---------------------------------------------------------------------------

export type ApiAction = 'testConnection' | 'models' | 'skills' | 'toolsets' | 'sessions';

export interface ApiRequest {
  type: 'api';
  action: ApiAction;
}

export type ApiResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Broadcasts from background -> side panel (chrome.runtime.sendMessage)
// ---------------------------------------------------------------------------

/**
 * Poke telling an open panel to consume the pending prompt from storage. The
 * prompt itself travels via storage (consumed exactly once) so this carries no
 * payload — avoiding duplicate application across the storage + broadcast paths.
 */
export interface PendingPromptBroadcast {
  type: 'pendingPrompt';
}

export interface NewChatBroadcast {
  type: 'newChat';
}

export type PanelBroadcast = PendingPromptBroadcast | NewChatBroadcast;
