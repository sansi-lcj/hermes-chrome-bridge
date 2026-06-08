// Optional on-device inference via Chrome's built-in AI (Prompt API / Gemini
// Nano), used as a fast, private, zero-cost path for light tasks. Everything is
// feature-detected so the extension degrades gracefully to the Hermes backend.
//
// API surface per Chrome's 2026 Prompt API: a global `LanguageModel` with
// `availability()` and `create()`, and sessions exposing `prompt()` /
// `promptStreaming()`.

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): AsyncIterable<string>;
  destroy(): void;
}

interface LanguageModelStatic {
  availability(): Promise<Availability>;
  create(options?: unknown): Promise<LanguageModelSession>;
}

declare global {
  var LanguageModel: LanguageModelStatic | undefined;
}

function api(): LanguageModelStatic | undefined {
  return typeof LanguageModel !== 'undefined' ? LanguageModel : undefined;
}

/** True if on-device inference is (or can become) usable on this machine. */
export async function onDeviceAvailable(): Promise<boolean> {
  const model = api();
  if (!model) return false;
  try {
    const status = await model.availability();
    return status !== 'unavailable';
  } catch {
    return false;
  }
}

/** Stream an on-device completion; throws if the model is unavailable. */
export async function* onDevicePromptStream(input: string): AsyncGenerator<string> {
  const model = api();
  if (!model) throw new Error('On-device model unavailable.');
  const session = await model.create();
  try {
    for await (const chunk of session.promptStreaming(input)) yield chunk;
  } finally {
    session.destroy();
  }
}
