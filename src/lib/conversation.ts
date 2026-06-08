import type { ChatRole } from './types';

/** A chat turn as shown in the UI, including any tool-progress trail. */
export interface StoredMessage {
  role: ChatRole;
  content: string;
  tools?: string[];
}

const KEY = 'conversation';

/** Load the persisted conversation (empty if none). */
export async function loadConversation(): Promise<StoredMessage[]> {
  const res = await chrome.storage.local.get(KEY);
  const msgs = res[KEY] as StoredMessage[] | undefined;
  return Array.isArray(msgs) ? msgs : [];
}

/** Persist the conversation, dropping any empty trailing assistant turn. */
export async function saveConversation(messages: StoredMessage[]): Promise<void> {
  const trimmed = messages.filter((m, i) => m.content.length > 0 || i < messages.length - 1);
  await chrome.storage.local.set({ [KEY]: trimmed });
}

/** Clear the persisted conversation. */
export async function clearConversation(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
