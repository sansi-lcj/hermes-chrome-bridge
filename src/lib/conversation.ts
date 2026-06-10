import type { ChatRole } from './types';

/** A chat turn as shown in the UI, including any tool-progress trail. */
export interface StoredMessage {
  role: ChatRole;
  content: string;
  tools?: string[];
}

/** Each account keeps its own conversation under conv:<accountId>. */
const keyFor = (accountId: string) => `conv:${accountId}`;

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

/** Load an account's persisted conversation (empty if none / no active account). */
export async function loadConversation(accountId: string | null): Promise<StoredMessage[]> {
  if (!accountId) return [];
  const res = await chrome.storage.local.get(keyFor(accountId));
  const msgs = res[keyFor(accountId)] as StoredMessage[] | undefined;
  return Array.isArray(msgs) ? msgs : [];
}

/** Persist an account's conversation (empty tail dropped, capped). */
export async function saveConversation(
  accountId: string | null,
  messages: StoredMessage[],
): Promise<void> {
  if (!accountId) return;
  await chrome.storage.local.set({ [keyFor(accountId)]: trimConversation(messages) });
}

/** Clear an account's persisted conversation. */
export async function clearConversation(accountId: string | null): Promise<void> {
  if (!accountId) return;
  await chrome.storage.local.remove(keyFor(accountId));
}
