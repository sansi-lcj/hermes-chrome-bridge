// Typed client for the Hermes Agent OpenAI-compatible HTTP API.
//
// All methods run in the background service worker, which holds the API key and
// (with a granted host permission for the configured origin) is not subject to
// page CORS. SSE streams are parsed manually from the fetch ReadableStream.

import type {
  ChatCompletionChunk,
  ChatMessage,
  ModelInfo,
  ModelsResponse,
  RunEvent,
  RunInfo,
  SessionInfo,
  Settings,
  Skill,
  ToolProgressEvent,
  Toolset,
} from './types';

export class HermesError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HermesError';
  }
}

/** A single yielded item from a chat stream. */
export type ChatStreamEvent =
  | { kind: 'delta'; content: string }
  | { kind: 'tool'; progress: ToolProgressEvent }
  | { kind: 'done' };

export class HermesClient {
  constructor(private settings: Settings) {}

  private get baseUrl(): string {
    if (!this.settings.baseUrl) {
      throw new HermesError('No Hermes base URL configured. Open Settings to set it.');
    }
    return this.settings.baseUrl.replace(/\/+$/, '');
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.settings.apiKey) {
      h.Authorization = `Bearer ${this.settings.apiKey}`;
    }
    return h;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: this.headers(init?.headers as Record<string, string>),
      });
    } catch (err) {
      throw new HermesError(
        `Network error contacting Hermes at ${this.baseUrl}. ` +
          `Check the URL and that the host permission is granted. (${String(err)})`,
      );
    }
    if (!res.ok) {
      throw new HermesError(await this.describeError(res), res.status);
    }
    return (await res.json()) as T;
  }

  private async describeError(res: Response): Promise<string> {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      return `Unauthorized (401). Check the API key. ${detail}`;
    }
    if (res.status === 404) {
      return `Not found (404). This Hermes server may not expose ${res.url}. ${detail}`;
    }
    return `Hermes request failed (${res.status}). ${detail}`;
  }

  // ----- Discovery / health -------------------------------------------------

  async health(): Promise<unknown> {
    return this.request('/v1/health');
  }

  async models(): Promise<ModelInfo[]> {
    const data = await this.request<ModelsResponse>('/v1/models');
    return data.data ?? [];
  }

  async skills(): Promise<Skill[]> {
    return this.listOf<Skill>('/v1/skills');
  }

  async toolsets(): Promise<Toolset[]> {
    return this.listOf<Toolset>('/v1/toolsets');
  }

  async sessions(): Promise<SessionInfo[]> {
    return this.listOf<SessionInfo>('/api/sessions');
  }

  /** Helper that tolerates both `[...]` and `{ data: [...] }` envelope shapes. */
  private async listOf<T>(path: string): Promise<T[]> {
    return unwrapList<T>(await this.request(path));
  }

  // ----- Chat completions (streaming) --------------------------------------

  async *chatStream(
    messages: ChatMessage[],
    model: string,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
    if (!res.ok) throw new HermesError(await this.describeError(res), res.status);
    if (!res.body) throw new HermesError('Hermes returned an empty stream body.');

    for await (const frame of parseSse(res.body, signal)) {
      // Hermes emits named events for tool progress; chat deltas arrive as the
      // default (unnamed) `data:` frames containing OpenAI chunk JSON.
      if (frame.event && frame.event.includes('tool')) {
        yield { kind: 'tool', progress: safeJson<ToolProgressEvent>(frame.data) ?? {} };
        continue;
      }
      if (frame.data === '[DONE]') {
        yield { kind: 'done' };
        return;
      }
      const chunk = safeJson<ChatCompletionChunk>(frame.data);
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) yield { kind: 'delta', content: delta };
    }
    yield { kind: 'done' };
  }

  // ----- Runs API (long tasks) ---------------------------------------------

  async createRun(messages: ChatMessage[], model: string): Promise<RunInfo> {
    return this.request<RunInfo>('/v1/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: messages }),
    });
  }

  async *runEvents(runId: string, signal: AbortSignal): AsyncGenerator<RunEvent> {
    const res = await fetch(`${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`, {
      headers: this.headers({ Accept: 'text/event-stream' }),
      signal,
    });
    if (!res.ok) throw new HermesError(await this.describeError(res), res.status);
    if (!res.body) throw new HermesError('Hermes returned an empty run-events body.');
    for await (const frame of parseSse(res.body, signal)) {
      if (frame.data === '[DONE]') return;
      yield { event: frame.event, data: safeJson(frame.data) ?? frame.data };
    }
  }

  async stopRun(runId: string): Promise<void> {
    await fetch(`${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/stop`, {
      method: 'POST',
      headers: this.headers(),
    }).catch(() => {
      /* best-effort cancel */
    });
  }
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

export interface SseFrame {
  event?: string;
  data: string;
}

/**
 * Incremental Server-Sent Events decoder. Feed it raw text via `push()` (chunk
 * boundaries may fall anywhere) and it returns whichever complete frames are
 * now available; call `flush()` at end-of-stream to emit a trailing frame that
 * had no terminating blank line. Pure and synchronous, so it is unit-testable
 * without a ReadableStream.
 */
export function createSseDecoder() {
  let buffer = '';
  let event: string | undefined;
  let dataLines: string[] = [];

  const consumeLine = (line: string, out: SseFrame[]) => {
    if (line === '') {
      if (dataLines.length > 0) out.push({ event, data: dataLines.join('\n') });
      event = undefined;
      dataLines = [];
      return;
    }
    if (line.startsWith(':')) return; // comment / heartbeat
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  };

  return {
    push(text: string): SseFrame[] {
      buffer += text;
      const out: SseFrame[] = [];
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        consumeLine(buffer.slice(0, nl).replace(/\r$/, ''), out);
        buffer = buffer.slice(nl + 1);
      }
      return out;
    },
    flush(): SseFrame[] {
      const out: SseFrame[] = [];
      if (buffer.length > 0) {
        consumeLine(buffer.replace(/\r$/, ''), out);
        buffer = '';
      }
      if (dataLines.length > 0) {
        out.push({ event, data: dataLines.join('\n') });
        dataLines = [];
      }
      return out;
    },
  };
}

/** Parse an SSE response body into frames using the incremental decoder. */
async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const sse = createSseDecoder();
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const frame of sse.push(decoder.decode(value, { stream: true }))) yield frame;
    }
    for (const frame of sse.flush()) yield frame;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

function safeJson<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Normalize `[...]`, `{ data: [...] }`, or `{ items: [...] }` into an array. */
export function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const o = raw as { data?: T[]; items?: T[] };
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.items)) return o.items;
  }
  return [];
}
