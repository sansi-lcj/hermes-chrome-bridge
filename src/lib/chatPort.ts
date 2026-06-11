// The long-lived chrome.runtime Port from the side panel to the background
// worker. Owns the connection lifecycle — connect, post, and transparent
// reconnect with exponential backoff when the MV3 worker recycles — so the chat
// store deals only in messages, not transport. Extracted from stores/chat.ts.

import type { BackgroundToUi, UiToBackground } from './types';

const PORT_NAME = 'hermes';
const RECONNECT_BASE_MS = 250;
const RECONNECT_MAX_MS = 5_000;

export interface ChatPort {
  /** Post a message, (re)connecting first if the link is currently down. */
  send(msg: UiToBackground): void;
}

/**
 * Connect to the background and keep the link alive. `onMessage` receives every
 * inbound frame; `onDisconnect` fires on each drop (so the caller can surface an
 * interrupted stream) just before a reconnect is scheduled. The port connects
 * lazily on the first `send`, matching the original store behavior.
 */
export function createChatPort(
  onMessage: (msg: BackgroundToUi) => void,
  onDisconnect: () => void,
): ChatPort {
  let port: chrome.runtime.Port | null = null;
  let reconnectDelay = RECONNECT_BASE_MS;

  const connect = (): void => {
    port = chrome.runtime.connect({ name: PORT_NAME });
    port.onMessage.addListener((msg: BackgroundToUi) => {
      reconnectDelay = RECONNECT_BASE_MS; // traffic means the link is healthy
      onMessage(msg);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      onDisconnect();
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS); // back off
    });
  };

  return {
    send(msg) {
      if (!port) connect();
      port?.postMessage(msg);
    },
  };
}
