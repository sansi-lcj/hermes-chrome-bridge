// Plain (hook-free) helpers for talking to the background service worker.

/** Send a one-off request to the background worker and unwrap the response. */
export async function sendRuntime<T>(message: unknown): Promise<T> {
  const res = (await chrome.runtime.sendMessage(message)) as
    | { ok: true; data: T }
    | { ok: false; error: string };
  if (!res || res.ok === false) {
    throw new Error(res?.error ?? 'No response from background worker.');
  }
  return res.data;
}
