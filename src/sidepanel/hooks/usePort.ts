import { useEffect, useRef } from 'react';
import type { BackgroundToUi, UiToBackground } from '../../lib/types';

/**
 * Maintains a long-lived Port to the background worker for streaming chat/run
 * output. Reconnects automatically if the worker is recycled.
 */
export function usePort(onMessage: (msg: BackgroundToUi) => void) {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      const port = chrome.runtime.connect({ name: 'hermes' });
      portRef.current = port;
      port.onMessage.addListener((msg: BackgroundToUi) => handlerRef.current(msg));
      port.onDisconnect.addListener(() => {
        portRef.current = null;
        if (!disposed) setTimeout(connect, 250);
      });
    };

    connect();
    return () => {
      disposed = true;
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, []);

  const send = (msg: UiToBackground) => {
    if (!portRef.current) portRef.current = chrome.runtime.connect({ name: 'hermes' });
    portRef.current.postMessage(msg);
  };

  return { send };
}

/** Thin wrapper around chrome.runtime.sendMessage with typed responses. */
export async function sendRuntime<T>(message: unknown): Promise<T> {
  const res = (await chrome.runtime.sendMessage(message)) as
    | { ok: true; data: T }
    | { ok: false; error: string };
  if (!res || res.ok === false) {
    throw new Error(res?.error ?? 'No response from background worker.');
  }
  return res.data;
}
