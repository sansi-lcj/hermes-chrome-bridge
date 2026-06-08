// A "pending prompt" handed from a Chrome entry point (context menu, omnibox,
// keyboard command) to the side panel. Stored in session storage so it survives
// the side panel opening, and consumed exactly once.

export interface PendingPrompt {
  text: string;
  /** When true, the panel sends it immediately instead of just prefilling. */
  autoSend: boolean;
}

const KEY = 'pendingPrompt';

// session storage clears when the browser closes and is limited to trusted
// contexts (background + panel), which is exactly what we want here.
function area(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

export async function setPendingPrompt(prompt: PendingPrompt): Promise<void> {
  await area().set({ [KEY]: prompt });
}

/** Read and clear the pending prompt, or null if none. */
export async function takePendingPrompt(): Promise<PendingPrompt | null> {
  const res = await area().get(KEY);
  const prompt = res[KEY] as PendingPrompt | undefined;
  if (prompt) await area().remove(KEY);
  return prompt ?? null;
}
