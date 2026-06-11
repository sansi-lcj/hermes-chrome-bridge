// On-device answering via Chrome's built-in AI, with monotonic-token
// cancellation: a newer run (or cancelOnDevice) supersedes any older stream.
// Extracted from stores/chat.ts; the store supplies the per-chunk callbacks.

import { onDevicePromptStream } from './builtinAI';
import type { StoredMessage } from './conversation';

export { onDeviceAvailable } from './builtinAI';

let token = 0;

/** Flatten a transcript (+ optional system prompt) into one prompt string. */
export function buildPrompt(messages: StoredMessage[], system: string): string {
  const lines = messages.filter((m) => m.content.length > 0).map((m) => `${m.role}: ${m.content}`);
  if (system.trim()) lines.unshift(`system: ${system.trim()}`);
  return lines.join('\n');
}

/** Cancel the current on-device stream (e.g. the user pressed Stop). */
export function cancelOnDevice(): void {
  token++;
}

/**
 * Stream an on-device answer. `onChunk` receives each token while this run is
 * current; `onError` fires if the model throws; `onDone` fires once unless a
 * newer run superseded this one. Starting a run implicitly supersedes the prior.
 */
export async function runOnDevice(
  prompt: string,
  onChunk: (text: string) => void,
  onError: (message: string) => void,
  onDone: () => void,
): Promise<void> {
  const mine = ++token;
  try {
    for await (const chunk of onDevicePromptStream(prompt)) {
      if (mine !== token) break; // cancelled or superseded
      onChunk(chunk);
    }
  } catch (e) {
    onError(String(e));
  } finally {
    if (mine === token) onDone();
  }
}
