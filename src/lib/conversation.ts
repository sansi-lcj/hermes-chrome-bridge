// Multi-conversation persistence, Chatbox-style: each account keeps a list of
// conversations (with titles, recency and an optional per-conversation system
// prompt) plus the messages of each one.
//
// Storage layout (chrome.storage.local):
//   convidx:<accountId>          -> ConversationIndex
//   conv:<accountId>:<convId>    -> StoredMessage[]
//   conv:<accountId>             -> legacy 1.8.x single conversation (migrated)

import type { ChatRole } from './types';

/** A chat turn as shown in the UI, including any tool-progress trail. */
export interface StoredMessage {
  role: ChatRole;
  content: string;
  tools?: string[];
}

/** One conversation's metadata (messages are stored separately). */
export interface ConversationMeta {
  id: string;
  /** Auto-derived from the first user message; renamable. */
  title: string;
  updatedAt: number;
  /** Optional per-conversation system prompt. */
  system?: string;
}

/** An account's conversation list. Ordered most-recent-first. */
export interface ConversationIndex {
  conversations: ConversationMeta[];
  activeId: string | null;
}

const indexKey = (accountId: string) => `convidx:${accountId}`;
const messagesKey = (accountId: string, convId: string) => `conv:${accountId}:${convId}`;
const legacyKey = (accountId: string) => `conv:${accountId}`;

export const emptyIndex = (): ConversationIndex => ({ conversations: [], activeId: null });

export function newConversationId(): string {
  return `c-${crypto.randomUUID()}`;
}

/** Cap stored history so chrome.storage.local can't grow unbounded. */
export const MAX_STORED_MESSAGES = 200;
/** Conversation titles derived from the first message are capped here. */
export const MAX_TITLE_CHARS = 40;

/** Derive a list title from a message (first line, length-capped). */
export function titleFrom(content: string): string {
  const line = content.trim().split('\n', 1)[0];
  return line.length > MAX_TITLE_CHARS ? `${line.slice(0, MAX_TITLE_CHARS)}…` : line;
}

/** Drop the empty trailing assistant turn and keep only the most recent messages. */
export function trimConversation(messages: StoredMessage[]): StoredMessage[] {
  const withoutEmptyTail = messages.filter(
    (m, i) => m.content.length > 0 || i < messages.length - 1,
  );
  return withoutEmptyTail.length > MAX_STORED_MESSAGES
    ? withoutEmptyTail.slice(-MAX_STORED_MESSAGES)
    : withoutEmptyTail;
}

/**
 * Load an account's conversation index, migrating a 1.8.x single-conversation
 * blob into a one-entry list on first run.
 */
export async function loadIndex(accountId: string | null): Promise<ConversationIndex> {
  if (!accountId) return emptyIndex();
  const res = await chrome.storage.local.get([indexKey(accountId), legacyKey(accountId)]);
  const existing = res[indexKey(accountId)] as ConversationIndex | undefined;
  if (existing && Array.isArray(existing.conversations)) return existing;

  const legacy = res[legacyKey(accountId)] as StoredMessage[] | undefined;
  if (Array.isArray(legacy) && legacy.length > 0) {
    const id = newConversationId();
    const firstUser = legacy.find((m) => m.role === 'user');
    const index: ConversationIndex = {
      conversations: [{ id, title: titleFrom(firstUser?.content ?? ''), updatedAt: Date.now() }],
      activeId: id,
    };
    await chrome.storage.local.set({
      [indexKey(accountId)]: index,
      [messagesKey(accountId, id)]: legacy,
    });
    await chrome.storage.local.remove(legacyKey(accountId));
    return index;
  }
  return emptyIndex();
}

export async function saveIndex(accountId: string | null, index: ConversationIndex): Promise<void> {
  if (!accountId) return;
  await chrome.storage.local.set({ [indexKey(accountId)]: index });
}

/** Load one conversation's messages (empty if unknown). */
export async function loadMessages(
  accountId: string | null,
  convId: string | null,
): Promise<StoredMessage[]> {
  if (!accountId || !convId) return [];
  const res = await chrome.storage.local.get(messagesKey(accountId, convId));
  const msgs = res[messagesKey(accountId, convId)] as StoredMessage[] | undefined;
  return Array.isArray(msgs) ? msgs : [];
}

/** Persist one conversation's messages (empty tail dropped, capped). */
export async function saveMessages(
  accountId: string | null,
  convId: string | null,
  messages: StoredMessage[],
): Promise<void> {
  if (!accountId || !convId) return;
  await chrome.storage.local.set({
    [messagesKey(accountId, convId)]: trimConversation(messages),
  });
}

/** Delete one conversation's stored messages. */
export async function removeMessages(
  accountId: string | null,
  convId: string | null,
): Promise<void> {
  if (!accountId || !convId) return;
  await chrome.storage.local.remove(messagesKey(accountId, convId));
}

/** A conversation that matched a search, with a snippet around the first hit. */
export interface SearchHit {
  id: string;
  title: string;
  /** Context around the first match (or the title, for title-only matches). */
  snippet: string;
}

const SNIPPET_RADIUS = 40;

/** Build a "…context [match] context…" snippet around the first occurrence. */
export function snippetAround(text: string, query: string): string {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return text.slice(0, SNIPPET_RADIUS * 2).trim();
  const start = Math.max(0, i - SNIPPET_RADIUS);
  const end = Math.min(text.length, i + query.length + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Search an account's conversations by title and message content. Loads each
 * conversation's messages from local storage (small, on-device) and returns the
 * matches most-recent-first, preserving the index's order.
 */
export async function searchConversations(
  accountId: string | null,
  index: ConversationIndex,
  rawQuery: string,
): Promise<SearchHit[]> {
  const query = rawQuery.trim();
  if (!accountId || query.length === 0) return [];
  const lower = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const meta of index.conversations) {
    if (meta.title.toLowerCase().includes(lower)) {
      hits.push({ id: meta.id, title: meta.title, snippet: meta.title });
      continue;
    }
    const messages = await loadMessages(accountId, meta.id);
    const match = messages.find((m) => m.content.toLowerCase().includes(lower));
    if (match) {
      hits.push({ id: meta.id, title: meta.title, snippet: snippetAround(match.content, query) });
    }
  }
  return hits;
}
