import type { ChatRole } from './types';

/** A chat turn as shown in the UI, including any tool-progress trail. */
export interface StoredMessage {
  role: ChatRole;
  content: string;
  tools?: string[];
}

const KEY = 'conversation';

/** Cap stored history so chrome.storage.local can't grow unbounded. */
export const MAX_STORED_MESSAGES = 200;

/** Drop the empty trailing assistant turn and keep only the most recent messages. */
export function trimConversation(messages: StoredMessage[]): StoredMessage[] {
  const withoutEmptyTail = messages.filter(
    (m, i) => m.content.length > 0 || i < messages.length - 1,
  );
  return withoutEmptyTail.length > MAX_STORED_MESSAGES
    ? withoutEmptyTail.slice(-MAX_STORED_MESSAGES)
    : withoutEmptyTail;
}

/** Load the persisted conversation (empty if none). */
export async function loadConversation(): Promise<StoredMessage[]> {
  const res = await chrome.storage.local.get(KEY);
  const msgs = res[KEY] as StoredMessage[] | undefined;
  return Array.isArray(msgs) ? msgs : [];
}

/** Persist the conversation (empty tail dropped, capped to the recent window). */
export async function saveConversation(messages: StoredMessage[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: trimConversation(messages) });
}

/** Clear the persisted conversation. */
export async function clearConversation(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
