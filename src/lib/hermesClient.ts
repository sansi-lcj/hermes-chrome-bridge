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
    const raw = await this.request<T[] | { data?: T[]; items?: T[] }>(path);
    if (Array.isArray(raw)) return raw;
    return raw.data ?? raw.items ?? [];
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

interface SseFrame {
  event?: string;
  data: string;
}

/**
 * Parse a Server-Sent Events stream into frames. Handles multi-line `data:`
 * fields and `event:` names; flushes one frame per blank-line separator.
 */
async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | undefined;
  let dataLines: string[] = [];

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);

        if (line === '') {
          // Blank line: dispatch the accumulated frame.
          if (dataLines.length > 0) {
            yield { event, data: dataLines.join('\n') };
          }
          event = undefined;
          dataLines = [];
          continue;
        }
        if (line.startsWith(':')) continue; // comment / heartbeat
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
    // Flush a trailing frame with no terminating blank line.
    if (dataLines.length > 0) yield { event, data: dataLines.join('\n') };
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
